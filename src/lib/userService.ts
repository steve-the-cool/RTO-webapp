import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where } from '@firebase/firestore';
import { db } from './firebase';
import bcrypt from 'bcryptjs';
import { getSession } from './auth';

// Types
export type UserRecord = {
  userId: string;
  fullName: string;
  username: string;
  email?: string;
  mobile?: string;
  role: 'admin' | 'manager' | 'employee' | 'viewer';
  status: 'active' | 'inactive' | 'suspended';
  isActive?: boolean;
  passwordHash: string;
  createdBy: string;
  createdAt: string; // ISO string
  updatedBy?: string;
  updatedAt?: string;
  lastLogin?: string;
  lastLoginIP?: string;
  profilePhotoURL?: string;
};

export type ActivityLog = {
  action: string;
  performedBy: string;
  performedAt: string; // ISO
  details?: Record<string, any>;
};

const USERS_COL = collection(db, 'users');
const LOGS_COL = collection(db, 'user_activity_logs');

/** Helper to log activity */
async function logActivity(action: string, details?: Record<string, any>) {
  const performedBy = getSession()?.username ?? 'system';
  await setDoc(doc(LOGS_COL), {
    action,
    performedBy,
    performedAt: new Date().toISOString(),
    details: details ?? {},
  });
}

/** Create a new user */
export async function createUser(input: {
  fullName: string;
  username: string;
  email?: string;
  mobile?: string;
  role: UserRecord['role'];
  password: string;
  createdBy?: string;
}) {
  // Ensure username uniqueness
  const existing = await getDocs(query(USERS_COL, where('username', '==', input.username)));
  if (!existing.empty) {
    throw new Error('Username already exists');
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  const newDocRef = doc(USERS_COL);
  const now = new Date().toISOString();
  const createdBy = input.createdBy ?? getSession()?.username ?? 'system';
  const user: UserRecord = {
    userId: newDocRef.id,
    fullName: input.fullName,
    username: input.username,
    email: input.email ?? '',
    mobile: input.mobile ?? '',
    role: input.role,
    status: input.role === 'admin' ? 'active' : 'inactive',
    isActive: input.role === 'admin',
    passwordHash,
    createdBy,
    createdAt: now,
  };
  await setDoc(newDocRef, user);
  await logActivity('User Created', { userId: user.userId, username: user.username });
  return user;
}

/** Update user fields (excluding password) */
export async function updateUser(userId: string, updates: Partial<Omit<UserRecord, 'userId' | 'passwordHash' | 'createdBy' | 'createdAt'>>, performedBy?: string) {
  const userRef = doc(USERS_COL, userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('User not found');
  const actor = performedBy ?? getSession()?.username ?? 'system';
  const data = { ...updates, updatedBy: actor, updatedAt: new Date().toISOString() };
  await updateDoc(userRef, data);
  await logActivity('User Updated', { userId, updates, performedBy: actor });
}

/** Reset password */
export async function resetPassword(userId: string, newPassword: string, performedBy?: string) {
  const userRef = doc(USERS_COL, userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('User not found');
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const actor = performedBy ?? getSession()?.username ?? 'system';
  await updateDoc(userRef, { passwordHash, updatedBy: actor, updatedAt: new Date().toISOString() });
  await logActivity('User Password Reset', { userId, performedBy: actor });
}

/** Delete user - admin PIN verification should be performed by caller */
export async function deleteUser(userId: string, performedBy?: string) {
  const userRef = doc(USERS_COL, userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('User not found');
  await deleteDoc(userRef);
  const actor = performedBy ?? getSession()?.username ?? 'system';
  await logActivity('User Deleted', { userId, performedBy: actor });
}

/** Activate / Deactivate / Suspend */
export async function setUserStatus(userId: string, status: UserRecord['status'], performedBy?: string) {
  const userRef = doc(USERS_COL, userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('User not found');
  const actor = performedBy ?? getSession()?.username ?? 'system';
  await updateDoc(userRef, { status, updatedBy: actor, updatedAt: new Date().toISOString(), isActive: status === 'active' });
  await logActivity('User Status Changed', { userId, status, performedBy: actor });
}

/** Fetch all users */
export async function fetchAllUsers() {
  const snap = await getDocs(USERS_COL);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
}

export const toggleUserStatus = setUserStatus;

/** Fetch a single user */
export async function fetchUser(userId: string) {
  const userRef = doc(USERS_COL, userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('User not found');
  return snap.data() as UserRecord;
}
// Seed default users (person1..person7) if they don't exist
export async function seedDefaultUsers() {
  const usernames = Array.from({ length: 7 }, (_, i) => `person${i + 1}`);
  for (const uname of usernames) {
    // Check if user already exists
    const existingSnap = await getDocs(query(USERS_COL, where('username', '==', uname)));
    if (!existingSnap.empty) continue;
    // Create user with employee role (inactive by default) then activate
    await createUser({
      fullName: uname,
      username: uname,
      role: 'employee',
      password: uname,
    });
    // Activate the newly created user
    const userSnap = await getDocs(query(USERS_COL, where('username', '==', uname)));
    const docRef = userSnap.docs[0];
    if (docRef) {
      await setUserStatus(docRef.id, 'active');
    }
  }
}
