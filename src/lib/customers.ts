// Customers — Firestore-backed customer profiles with vehicles.
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { db } from "./firebase";
import { removeUndefined, type RecordStatus } from "./records";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VehicleRecord {
  id: string;
  mvNo: string;
  work: string;
  insurance: string;
  fitness: string;
  tax: string;
  status: RecordStatus;
}

export interface CustomerAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  storagePath: string; // Firebase Storage path
  downloadUrl: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface CustomerProfile {
  id: string;
  name: string;
  address: string;
  mobile: string;
  email: string;
  vehicles: VehicleRecord[];
  attachments?: CustomerAttachment[];
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

const COL = "registry_customers";

/** Subscribe to live customer profile updates. Returns unsubscribe function. */
export function subscribeToCustomers(
  cb: (customers: CustomerProfile[]) => void,
  errorCb?: (error: unknown) => void,
): () => void {
  const q = query(collection(db, COL), orderBy("name"));
  return onSnapshot(
    q,
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CustomerProfile));
    },
    (error) => {
      console.error("[subscribeToCustomers] Firestore error:", error);
      if (errorCb) {
        errorCb(error);
      }
      cb([]);
    },
  );
}

/** Upsert a customer profile. */
export async function saveCustomerProfile(profile: CustomerProfile): Promise<void> {
  const { id, ...data } = profile;
  const cleanedData = removeUndefined(data);
  await setDoc(doc(db, COL, id), cleanedData, { merge: true });
}

/** Delete a customer profile. */
export async function deleteCustomerProfile(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

/** Add an attachment to a customer profile. */
export async function addAttachment(
  customerId: string,
  attachment: CustomerAttachment,
): Promise<void> {
  console.log("[addAttachment] FIRESTORE_UPDATE_STARTED:", {
    customerId,
    attachmentId: attachment.id,
    attachmentName: attachment.name,
    attachmentSize: attachment.size,
    attachmentType: attachment.type,
    storagePath: attachment.storagePath,
    hasDownloadUrl: !!attachment.downloadUrl,
    documentRef: `registry_customers/${customerId}`,
  });

  // Validate attachment object doesn't contain problematic values
  if (attachment.downloadUrl && typeof attachment.downloadUrl !== "string") {
    throw new Error(`[addAttachment] Invalid downloadUrl type: ${typeof attachment.downloadUrl}`);
  }
  if (typeof attachment.size !== "number") {
    throw new Error(`[addAttachment] Invalid size type: ${typeof attachment.size}`);
  }

  try {
    await updateDoc(doc(db, COL, customerId), {
      attachments: arrayUnion(removeUndefined(attachment)),
    });
    console.log("[addAttachment] FIRESTORE_UPDATE_SUCCESS:", {
      customerId,
      attachmentId: attachment.id,
    });
  } catch (error) {
    console.error("[addAttachment] FIRESTORE_UPDATE_FAILED:", {
      customerId,
      attachmentId: attachment.id,
      errorCode: (error as any)?.code,
      errorMessage: (error as any)?.message,
      fullError: error,
    });
    throw error;
  }
}

// ─── Legacy stubs ─────────────────────────────────────────────────────────────

/** @deprecated Use subscribeToCustomers(). */
export function loadCustomers(): CustomerProfile[] {
  return [];
}

/** @deprecated Use saveCustomerProfile(). */
export async function saveCustomers(profiles: CustomerProfile[]): Promise<void> {
  await Promise.all(profiles.map(saveCustomerProfile));
}
