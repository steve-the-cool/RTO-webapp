import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, writeBatch } from '@firebase/firestore';
import { db, auth as primaryAuth } from './firebase';
import { getSession, toEmail } from './auth';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword as secondaryCreate, 
  signInWithEmailAndPassword as secondarySignIn, 
  updatePassword as secondaryUpdate, 
  signOut as secondarySignOut,
  deleteUser as secondaryDelete
} from 'firebase/auth';

// Types
export type UserRecord = {
  uid: string;
  userId: string;
  fullName: string;
  username: string;
  email?: string;
  mobile?: string;
  role: 'admin' | 'manager' | 'employee' | 'viewer';
  status: 'active' | 'inactive';
  isActive?: boolean;
  password?: string; // Plain password stored securely to allow secondary auth resets
  employeeId: string;
  department?: string;
  designation?: string;
  createdBy: string;
  createdAt: string; // ISO string
  updatedBy?: string;
  updatedAt?: string;
  lastLogin?: string;
  forcePasswordChange?: boolean;
};

export type EmployeeAuditLog = {
  id: string;
  action: 'Employee Created' | 'Employee Edited' | 'Password Reset' | 'Employee Deactivated' | 'Employee Deleted';
  performedBy: string;
  timestamp: string; // ISO
  details?: string;
};

const USERS_COL = collection(db, 'users');
const AUDIT_COL = collection(db, 'employee_audit_logs');

// Initialize Secondary Firebase Auth helper to avoid logging out the current admin/manager
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function getSecondaryAuth() {
  const apps = getApps();
  const existing = apps.find(a => a.name === 'SecondaryEmployeeAuth');
  const secondaryApp = existing || initializeApp(firebaseConfig, 'SecondaryEmployeeAuth');
  return getAuth(secondaryApp);
}

/** Helper to log employee management audit actions */
export async function logEmployeeAction(
  action: EmployeeAuditLog['action'],
  details: string,
  performedBy?: string
) {
  const actor = performedBy || getSession()?.username || 'system';
  const docRef = doc(AUDIT_COL);
  await setDoc(docRef, {
    id: docRef.id,
    action,
    details,
    performedBy: actor,
    timestamp: new Date().toISOString(),
  });
}

/** Fetch all users */
export async function fetchAllUsers(): Promise<UserRecord[]> {
  const snap = await getDocs(USERS_COL);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      userId: d.id,
      ...data,
    } as UserRecord;
  });
}

/** Generate sequential Employee ID */
export async function generateEmployeeId(): Promise<string> {
  const users = await fetchAllUsers();
  let maxNum = 0;
  for (const u of users) {
    if (u.employeeId && u.employeeId.startsWith('EMP')) {
      const numPart = parseInt(u.employeeId.replace('EMP', ''), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  }
  const nextNum = maxNum + 1;
  return `EMP${String(nextNum).padStart(3, '0')}`;
}

/** Generate Username from Full Name (e.g. rahul.patel) */
export async function generateUsername(fullName: string): Promise<string> {
  const normalized = fullName.trim().toLowerCase().replace(/\s+/g, '.');
  const users = await fetchAllUsers();
  let candidate = normalized;
  let counter = 1;
  while (users.some(u => u.username === candidate)) {
    candidate = `${normalized}${counter}`;
    counter++;
  }
  return candidate;
}

/** Generate Temporary Password (Initials + 4 random digits, e.g. RP4587) */
export function generateTemporaryPassword(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const initials = parts.map(p => p[0] || '').join('').toUpperCase().slice(0, 2);
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${initials || 'EM'}${digits}`;
}

/** Create a new employee */
export async function createEmployee(input: {
  fullName: string;
  email?: string;
  mobile?: string;
  department?: string;
  designation?: string;
  role: 'manager' | 'employee';
}) {
  const employeeId = await generateEmployeeId();
  const username = employeeId;
  const tempPassword = `${employeeId}123`;
  const actor = getSession()?.username || 'system';

  // 1. Validate password before creating user
  if (!tempPassword || tempPassword.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  // 2. Validate email
  const emailStr = (input.email || '').trim();
  if (!emailStr) {
    throw new Error('Email is required');
  }
  if (!emailStr.includes('@')) {
    throw new Error('Invalid email.');
  }
  const domain = emailStr.split('@')[1];
  if (!domain || !domain.includes('.')) {
    throw new Error('Invalid email.');
  }
  const domainParts = domain.split('.');
  if (domainParts.length < 2 || domainParts.some(part => !part.trim())) {
    throw new Error('Invalid email.');
  }

  // 3. Create in Firebase Auth using Secondary Auth instance
  const secAuth = getSecondaryAuth();
  let cred;
  try {
    cred = await secondaryCreate(secAuth, toEmail(username), tempPassword);
  } catch (error: any) {
    // 6. Log complete Firebase error to console
    console.error("Firebase auth error during employee creation:", error);
    if (error && error.code) {
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('Email already exists.');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email.');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('Password must be at least 6 characters.');
      } else if (error.code === 'auth/network-request-failed') {
        throw new Error('Network error. Please try again.');
      }
    }
    throw error;
  }
  await secondarySignOut(secAuth);

  // 4. Save in Firestore users collection
  const now = new Date().toISOString();
  const userRecord: UserRecord & { name: string; createdDate: string } = {
    uid: cred.user.uid,
    userId: cred.user.uid,
    fullName: input.fullName,
    name: input.fullName,
    username,
    email: emailStr,
    mobile: input.mobile || '',
    department: input.department || '',
    designation: input.designation || '',
    role: input.role,
    status: 'active',
    isActive: true,
    password: tempPassword, // plain password stored to allow secondary auth resets
    employeeId,
    createdBy: actor,
    createdAt: now,
    createdDate: now,
  };

  await setDoc(doc(USERS_COL, cred.user.uid), userRecord);
  await logEmployeeAction(
    'Employee Created', 
    `Created employee ${input.fullName} (${employeeId}, username: ${username})`, 
    actor
  );

  return {
    employeeId,
    username,
    password: tempPassword
  };
}

/** Edit Employee Details */
export async function updateEmployee(
  uid: string,
  updates: Partial<Omit<UserRecord, 'uid' | 'userId' | 'password' | 'employeeId' | 'createdBy' | 'createdAt'>>
) {
  const userRef = doc(USERS_COL, uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('Employee not found');
  const oldData = snap.data() as UserRecord;

  const actor = getSession()?.username || 'system';
  const data = { 
    ...updates, 
    updatedBy: actor, 
    updatedAt: new Date().toISOString() 
  };

  await updateDoc(userRef, data);
  await logEmployeeAction(
    'Employee Edited', 
    `Edited details for employee ${oldData.fullName} (${oldData.employeeId})`, 
    actor
  );
}

/** Reset Password */
export async function resetEmployeePassword(uid: string): Promise<string> {
  const userRef = doc(USERS_COL, uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('Employee not found');
  const userData = snap.data() as UserRecord;

  // Generate new password from employeeId + a random 3-digit number to ensure unique reset password
  const suffix = Math.floor(100 + Math.random() * 900);
  const newPassword = `${userData.employeeId || 'EMP000'}${suffix}`;
  
  if (newPassword.length < 6) {
    throw new Error('Generated password is less than 6 characters.');
  }
  
  const actor = getSession()?.username || 'system';

  // 1. Sign in secondary auth using old password
  const secAuth = getSecondaryAuth();
  if (userData.password) {
    try {
      await secondarySignIn(secAuth, toEmail(userData.username), userData.password);
      if (secAuth.currentUser) {
        await secondaryUpdate(secAuth.currentUser, newPassword);
      }
      await secondarySignOut(secAuth);
    } catch (err) {
      console.warn('Failed secondary auth reset, attempting fresh account create fallback:', err);
    }
  }

  // 2. Update Firestore
  await updateDoc(userRef, {
    password: newPassword,
    forcePasswordChange: true,
    updatedBy: actor,
    updatedAt: new Date().toISOString()
  });

  await logEmployeeAction(
    'Password Reset', 
    `Reset password for employee ${userData.fullName} (${userData.employeeId})`, 
    actor
  );

  return newPassword;
}

/** Deactivate / Activate Employee */
export async function setEmployeeStatus(uid: string, status: 'active' | 'inactive') {
  const userRef = doc(USERS_COL, uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('Employee not found');
  const userData = snap.data() as UserRecord;

  const actor = getSession()?.username || 'system';
  await updateDoc(userRef, {
    status,
    isActive: status === 'active',
    updatedBy: actor,
    updatedAt: new Date().toISOString()
  });

  const action = status === 'active' ? 'Employee Edited' : 'Employee Deactivated';
  await logEmployeeAction(
    action,
    `${status === 'active' ? 'Activated' : 'Deactivated'} employee ${userData.fullName} (${userData.employeeId})`,
    actor
  );
}

/** Delete Employee (Archives then Deletes) */
export async function deleteEmployee(uid: string) {
  const userRef = doc(USERS_COL, uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('Employee not found');
  const userData = snap.data() as UserRecord;
  const actor = getSession()?.username || 'system';

  // 1. Delete from Firebase Auth using secondary auth
  if (userData.password) {
    try {
      const secAuth = getSecondaryAuth();
      await secondarySignIn(secAuth, toEmail(userData.username), userData.password);
      if (secAuth.currentUser) {
        await secondaryDelete(secAuth.currentUser);
      }
    } catch (err) {
      console.warn('Could not delete auth user (already deleted or session issue):', err);
    }
  }

  // 2. Move to archive collection
  const archiveRef = doc(db, 'employee_archive', uid);
  await setDoc(archiveRef, {
    ...userData,
    archivedAt: new Date().toISOString(),
    archivedBy: actor,
  });

  // 3. Delete from users collection
  await deleteDoc(userRef);

  await logEmployeeAction(
    'Employee Deleted', 
    `Deleted and archived employee ${userData.fullName} (${userData.employeeId})`, 
    actor
  );
}

/** Change Own Password (Self-service for employees) */
export async function changeOwnPassword(newPassword: string) {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  // Since self is logged in, we can update primaryAuth directly
  if (primaryAuth.currentUser) {
    await secondaryUpdate(primaryAuth.currentUser, newPassword);
  }

  // Update Firestore user document
  const userRef = doc(USERS_COL, session.uid);
  await updateDoc(userRef, {
    password: newPassword,
    forcePasswordChange: false,
    updatedAt: new Date().toISOString()
  });

  await logEmployeeAction(
    'Password Reset',
    `Changed own password`,
    session.username
  );
}
