// Per-customer document store — Firestore metadata + Firebase Storage for files.
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc as firestoreDeleteDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  FirebaseStorage,
} from "firebase/storage";
import { db, storage } from "./firebase";
import { removeUndefined } from "./records";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CustomerDoc {
  id: string;
  customerId: string;
  name: string;
  type: string;
  addedAt: string;
  /** Present when a real file was uploaded to Firebase Storage. */
  storagePath?: string;
  /** Firebase Storage download URL (if file uploaded). */
  downloadURL?: string;
  /** Original file MIME type. */
  mimeType?: string;
  /** File size in bytes. */
  fileSize?: number;
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

const COL = "registry_customer_docs";
export const GENERAL_CUSTOMER_ID = "__unlinked__";

/**
 * Subscribe to live doc updates for a specific customer.
 * Returns an unsubscribe function for useEffect cleanup.
 */
export function subscribeToDocsFor(
  customerId: string,
  cb: (docs: CustomerDoc[]) => void,
): () => void {
  const q = query(
    collection(db, COL),
    where("customerId", "==", customerId),
    orderBy("addedAt", "desc"),
  );

  const unsub = onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CustomerDoc);
      console.log(
        "[subscribeToDocsFor] Retrieved",
        docs.length,
        "documents for customer:",
        customerId,
      );
      cb(docs);
    },
    (error) => {
      console.error("[subscribeToDocsFor] Subscription error for customer:", customerId, error);
    },
  );

  return unsub;
}

/**
 * Subscribe to all document entries in the system.
 */
export function subscribeToAllDocs(cb: (docs: CustomerDoc[]) => void): () => void {
  const q = query(collection(db, COL), orderBy("addedAt", "desc"));
  return onSnapshot(q, (snap) => {
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CustomerDoc);
    cb(docs);
  });
}

/**
 * Add a document entry for a customer.
 * If `file` is provided it will be uploaded to Firebase Storage first.
 *
 * @param onProgress  Optional callback 0–100 during upload.
 */
export async function addDoc(
  customerId: string,
  name: string,
  type: string,
  file?: File,
  onProgress?: (pct: number) => void,
): Promise<CustomerDoc> {
  console.log(
    "[addDoc] Starting upload for customer:",
    customerId,
    "name:",
    name,
    "type:",
    type,
    "file:",
    file?.name,
  );

  const id = crypto.randomUUID();
  let storagePath: string | undefined;
  let downloadURL: string | undefined;
  let mimeType: string | undefined;
  let fileSize: number | undefined;

  if (file) {
    const safeFileName = `${id}_${file.name}`;
    storagePath =
      customerId === GENERAL_CUSTOMER_ID
        ? `documents/general/attachments/${safeFileName}`
        : `customers/${customerId}/attachments/${safeFileName}`;
    const storageRef = ref(storage, storagePath);

    console.log("[addDoc] Uploading file to:", storagePath);

    try {
      downloadURL = await uploadFileWithRetry(storageRef, file, onProgress);
      console.log(
        "[addDoc] File uploaded successfully, URL:",
        downloadURL?.substring(0, 50) + "...",
      );
      mimeType = file.type;
      fileSize = file.size;
    } catch (error) {
      console.error("[addDoc] Upload failed:", error);
      try {
        await deleteObject(storageRef);
      } catch {
        // Ignore cleanup errors
      }
      throw new Error(`Upload failed: ${getErrorMessage(error)}`);
    }
  }

  const docEntry: CustomerDoc = {
    id,
    customerId,
    name,
    type,
    addedAt: new Date().toISOString(),
    ...(storagePath ? { storagePath, downloadURL, mimeType, fileSize } : {}),
  };

  console.log("[addDoc] Creating Firestore document:", docEntry);

  try {
    const { id: _id, ...data } = docEntry;
    const docRef = doc(db, COL, id);
    console.log("[addDoc] Writing to Firestore at:", docRef.path);
    await setDoc(docRef, removeUndefined(data));
    console.log("[addDoc] Document written successfully");
    return docEntry;
  } catch (error) {
    console.error("[addDoc] Firestore write failed:", error);
    throw new Error(
      `Failed to save document: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function updateDoc(
  docId: string,
  customerId: string,
  name: string,
  type: string,
  file: File,
  onProgress?: (pct: number) => void,
  oldStoragePath?: string,
): Promise<CustomerDoc> {
  console.log("[updateDoc] Replacing document:", docId, "for customer:", customerId, "type:", type);
  const storageId = crypto.randomUUID();
  const safeFileName = `${storageId}_${file.name}`;
  const storagePath =
    customerId === GENERAL_CUSTOMER_ID
      ? `documents/general/attachments/${safeFileName}`
      : `customers/${customerId}/attachments/${safeFileName}`;
  const storageRef = ref(storage, storagePath);

  let downloadURL: string;
  try {
    downloadURL = await uploadFileWithRetry(storageRef, file, onProgress);
  } catch (error) {
    console.error("[updateDoc] Upload failed:", error);
    try {
      await deleteObject(storageRef);
    } catch {
      // Ignore cleanup errors
    }
    throw new Error(`Upload failed: ${getErrorMessage(error)}`);
  }

  const updatedDoc: CustomerDoc = {
    id: docId,
    customerId,
    name,
    type,
    addedAt: new Date().toISOString(),
    storagePath,
    downloadURL,
    mimeType: file.type,
    fileSize: file.size,
  };

  try {
    const { id: _id, ...data } = updatedDoc;
    const docRef = doc(db, COL, docId);
    await setDoc(docRef, removeUndefined(data));
    if (oldStoragePath && oldStoragePath !== storagePath) {
      try {
        await deleteObject(ref(storage, oldStoragePath));
      } catch {
        // ignore cleanup failures
      }
    }
    return updatedDoc;
  } catch (error) {
    console.error("[updateDoc] Firestore update failed:", error);
    throw new Error(
      `Failed to update document: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Upload a file to Firebase Storage with exponential backoff retry.
 * Returns the download URL on success.
 */
async function uploadFileWithRetry(
  storageRef: any,
  file: File,
  onProgress?: (pct: number) => void,
  maxRetries: number = 3,
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `[uploadFileWithRetry] Attempt ${attempt + 1}/${maxRetries + 1} for file: ${file.name}`,
      );
      const result = await uploadFileOnce(storageRef, file, onProgress);
      console.log(`[uploadFileWithRetry] Successfully uploaded on attempt ${attempt + 1}`);
      return result;
    } catch (error) {
      lastError = error as Error;
      console.warn(`[uploadFileWithRetry] Attempt ${attempt + 1} failed:`, error);

      // Don't retry on validation errors
      if (error instanceof Error && error.message.includes("validation")) {
        console.error("[uploadFileWithRetry] Validation error - not retrying");
        throw error;
      }

      // If this was the last attempt, throw
      if (attempt === maxRetries) {
        console.error(`[uploadFileWithRetry] All ${maxRetries + 1} attempts failed`);
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delayMs = Math.pow(2, attempt) * 1000;
      console.log(`[uploadFileWithRetry] Retrying in ${delayMs}ms... (attempt ${attempt + 2})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error("Upload failed after all retries");
}

/**
 * Perform a single upload attempt.
 */
async function uploadFileOnce(
  storageRef: any,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let uploadTimeout: NodeJS.Timeout | null = null;
    let resolved = false;

    // Set a timeout for the entire upload
    uploadTimeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(
          new Error(
            "Upload timeout — file took too long to upload. Please try a smaller file or check your connection.",
          ),
        );
      }
    }, 120000); // 2 minutes total

    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || "application/octet-stream",
      customMetadata: {
        uploadedAt: new Date().toISOString(),
      },
    });

    task.on(
      "state_changed",
      (snap) => {
        // Update progress
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        console.log("[uploadFileOnce] Progress:", pct);
        onProgress?.(pct);
      },
      (error) => {
        if (!resolved) {
          resolved = true;
          if (uploadTimeout) clearTimeout(uploadTimeout);
          console.error("[uploadFileOnce] Upload error:", error);
          reject(error);
        }
      },
      async () => {
        if (!resolved) {
          resolved = true;
          if (uploadTimeout) clearTimeout(uploadTimeout);
          try {
            console.log("[uploadFileOnce] Upload completed, getting download URL...");
            const url = await getDownloadURL(task.snapshot.ref);
            console.log("[uploadFileOnce] Download URL obtained:", url.substring(0, 50) + "...");
            resolve(url);
          } catch (error) {
            console.error("[uploadFileOnce] Failed to get download URL:", error);
            reject(error);
          }
        }
      },
    );
  });
}

/**
 * Extract user-friendly error message from Firebase errors.
 */
function getErrorMessage(error: any): string {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes("storage/retry-limit-exceeded")) {
      return "Upload retry limit exceeded. Please check your internet connection and try again with a smaller file.";
    }
    if (msg.includes("storage/unauthorized")) {
      return "You don't have permission to upload files. Please contact support.";
    }
    if (msg.includes("storage/object-not-found")) {
      return "File upload location not found. Please try again.";
    }
    if (msg.includes("timeout")) {
      return "Upload took too long. Please check your connection and try a smaller file.";
    }
    if (msg.includes("Network")) {
      return "Network error. Please check your internet connection and try again.";
    }
    return msg;
  }
  return "Unknown upload error. Please try again.";
}

/** Delete a document entry and its Storage file (if any). */
export async function deleteDoc(docId: string, storagePath?: string): Promise<void> {
  await firestoreDeleteDoc(doc(db, COL, docId));
  if (storagePath) {
    try {
      await deleteObject(ref(storage, storagePath));
    } catch {
      // File may have already been deleted — ignore
    }
  }
}

// ─── Legacy stubs ─────────────────────────────────────────────────────────────

/** @deprecated Use subscribeToDocsFor(). */
export function loadDocsFor(_customerId: string): CustomerDoc[] {
  return [];
}
