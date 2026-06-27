import { getFirestore, doc, getDoc, setDoc, collection, addDoc, Timestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import * as bcrypt from 'bcryptjs';

// Firestore reference (assumes firebase has been initialized elsewhere)
const db = getFirestore();

/**
 * Retrieves the hashed admin PIN from Firestore.
 */
export async function getAdminPinHash(): Promise<string | null> {
  const ref = doc(db, 'system_settings', 'admin_security');
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as { adminPinHash?: string };
  return data.adminPinHash ?? null;
}

/**
 * Verifies a plain PIN against the stored hash.
 * Returns true if the PIN matches, false otherwise.
 */
export async function verifyAdminPin(pin: string): Promise<boolean> {
  const hash = await getAdminPinHash();
  if (!hash) return false;
  // bcrypt.compare returns a promise when using the async version
  return bcrypt.compare(pin, hash);
}

/**
 * Hashes a PIN for storage. Uses bcrypt with a salt.
 */
export async function hashPin(pin: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(pin, saltRounds);
}

/**
 * Logs a deletion event to Firestore for audit purposes.
 */
export interface DeletionLog {
  recordType: string;
  recordId: string;
  deletedBy: string; // uid of the user performing deletion
  deletedAt: Date;
  pinVerified: boolean;
  ip?: string;
}

export async function logDeletion(log: DeletionLog): Promise<void> {
  const col = collection(db, 'deletion_audit_logs');
  await addDoc(col, {
    recordType: log.recordType,
    recordId: log.recordId,
    deletedBy: log.deletedBy,
    deletedAt: Timestamp.fromDate(log.deletedAt),
    pinVerified: log.pinVerified,
    ip: log.ip ?? null,
  });
}
