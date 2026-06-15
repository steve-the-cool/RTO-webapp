// Records — Firestore-backed client & lead registry.
import {
  collection,
  query,
  orderBy,
  where,
  getDocs,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  arrayUnion,
  addDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { createActivity, type ActivityLog } from "./activity";
import { transformInput, getForceCapsSetting, CAPITALIZE_FIELDS } from "./capitalize-settings";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecordStatus = "Pending" | "In Progress" | "Completed" | "On Hold";

export type DeleteReason = "Duplicate Entry" | "Wrong Customer" | "Testing Data" | "Other";

export interface RecordAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  storagePath: string; // Firebase Storage path
  downloadUrl: string;
  uploadedAt: string;
  uploadedBy: string;
}

export type PaymentStatus = "Paid" | "Partially Paid" | "Unpaid";

export type ServiceType = 
  | "Insurance"
  | "Fitness"
  | "Gujarat Permit"
  | "National Permit"
  | "Tax"
  | "PUC"
  | "License"
  | "RC Transfer"
  | "HP Addition"
  | "HP Termination";

export type ServiceStatus = "Pending" | "In Progress" | "Completed" | "On Hold" | "Renewal Due";

export const SERVICE_TYPES: ServiceType[] = [
  "Insurance",
  "Fitness",
  "Gujarat Permit",
  "National Permit",
  "Tax",
  "PUC",
  "License",
  "RC Transfer",
  "HP Addition",
  "HP Termination",
];

/**
 * Maps URL-safe route parameters (lowercase/dash-separated) to proper ServiceType names.
 * Used to resolve service types from dynamic routes like /dashboard/service/{serviceType}
 */
export const SERVICE_ROUTE_MAP: Record<string, ServiceType> = {
  insurance: "Insurance",
  fitness: "Fitness",
  "gujarat-permit": "Gujarat Permit",
  "national-permit": "National Permit",
  tax: "Tax",
  puc: "PUC",
  license: "License",
  "rc-transfer": "RC Transfer",
  "hp-addition": "HP Addition",
  "hp-termination": "HP Termination",
};

/**
 * CRITICAL: Normalize any service type value to canonical form.
 * Handles: "insurance" → "Insurance", "INSURANCE" → "Insurance", "Insurance" → "Insurance"
 * MUST be called before every Firestore write to maintain data consistency.
 */
export function normalizeServiceType(value: any): ServiceType | null {
  if (!value || typeof value !== "string") return null;
  
  const trimmed = value.trim();
  
  // Check if already canonical (in SERVICE_TYPES)
  if (SERVICE_TYPES.includes(trimmed as ServiceType)) {
    return trimmed as ServiceType;
  }
  
  // Try mapping from route parameter format
  const mapped = SERVICE_ROUTE_MAP[trimmed.toLowerCase()];
  if (mapped) return mapped;
  
  // Try converting from lowercase slug format
  const asSlug = trimmed.toLowerCase().replace(/\s+/g, "-");
  const mapped2 = SERVICE_ROUTE_MAP[asSlug];
  if (mapped2) return mapped2;
  
  console.warn("[normalizeServiceType] Unknown service type:", value, "- not in SERVICE_TYPES or SERVICE_ROUTE_MAP");
  return null;
}

export interface RegistryRecord {
  id: string;
  srNo: number;
  date: string; // yyyy-mm-dd
  mvNo: string;
  application: string;
  work: string;
  name: string;
  status: RecordStatus;
  mo: string;
  insurance: string;
  fitness: string;
  tax: string;
  co: string;
  groupName?: string; // Customer group/company
  assignee?: string; // staff username
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
  activityLogs?: ActivityLog[];
  attachments?: RecordAttachment[]; // Files attached to this client record
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: DeleteReason;
  // Accounting fields
  serviceAmount?: number; // Total service charge
  amountReceived?: number; // Amount paid
  paymentDate?: string; // Date of last payment
  paymentStatus?: PaymentStatus; // Calculated: Paid | Partially Paid | Unpaid
  // Service Management fields
  serviceType?: ServiceType; // Legacy single service field (kept for compatibility)
  services?: ServiceType[]; // New multi-service support
  serviceStatus?: ServiceStatus; // Service-specific status
  serviceDueDate?: string; // ISO date string for service renewal
}

/**
 * Get canonical services for a record, supporting legacy `serviceType`.
 */
export function getRecordServices(record: RegistryRecord): ServiceType[] {
  if (Array.isArray(record.services) && record.services.length > 0) return record.services;
  if (record.serviceType) return [record.serviceType];
  return [];
}

export type Bucket = "clients" | "leads" | "customers";

// ─── Staff users (shared across auth + tasks) ─────────────────────────────────

export const STAFF_USERS: { username: string; name: string }[] = [
  { username: "staff", name: "Front Desk" },
  { username: "priya", name: "Priya Nair" },
  { username: "rahul", name: "Rahul Verma" },
];

export const staffLabel = (username?: string) =>
  STAFF_USERS.find((s) => s.username === username)?.name ?? "";

// ─── Service helpers ──────────────────────────────────────────────────────────

export const serviceLabel = (type?: ServiceType): string => {
  if (!type) return "";
  const labels: Record<ServiceType, string> = {
    "Insurance": "🛡️ Insurance",
    "Fitness": "💪 Fitness",
    "Gujarat Permit": "📍 Gujarat Permit",
    "National Permit": "🇮🇳 National Permit",
    "Tax": "💰 Tax",
    "PUC": "🌍 PUC",
    "License": "🔖 License",
    "RC Transfer": "🔄 RC Transfer",
    "HP Addition": "➕ HP Addition",
    "HP Termination": "❌ HP Termination",
  };
  return labels[type] ?? type;
};

export const serviceColor = (type?: ServiceType): string => {
  if (!type) return "bg-gray-500";
  const colors: Record<ServiceType, string> = {
    "Insurance": "bg-blue-500",
    "Fitness": "bg-green-500",
    "Gujarat Permit": "bg-purple-600",
    "National Permit": "bg-purple-700",
    "Tax": "bg-yellow-500",
    "PUC": "bg-emerald-500",
    "License": "bg-cyan-500",
    "RC Transfer": "bg-orange-500",
    "HP Addition": "bg-pink-500",
    "HP Termination": "bg-red-500",
  };
  return colors[type] ?? "bg-gray-500";
};

/**
 * Convert ServiceType to URL-safe route parameter (lowercase, dash-separated).
 * Used for generating service dashboard URLs.
 */
export const serviceToUrlParam = (type?: ServiceType): string => {
  if (!type) return "";
  return type
    .toLowerCase()
    .replace(/\s+/g, "-"); // Replace spaces with dashes
};

// ─── Accounting helpers ────────────────────────────────────────────────────────

/** Calculate payment status based on amounts. */
export function calculatePaymentStatus(
  serviceAmount?: number,
  amountReceived?: number,
): PaymentStatus {
  if (!serviceAmount || serviceAmount === 0) return "Unpaid";
  if (!amountReceived || amountReceived === 0) return "Unpaid";
  if (amountReceived >= serviceAmount) return "Paid";
  return "Partially Paid";
}

/** Calculate pending amount (serviceAmount - amountReceived). */
export function calculatePendingAmount(
  serviceAmount?: number,
  amountReceived?: number,
): number {
  if (!serviceAmount) return 0;
  if (!amountReceived) return serviceAmount;
  return Math.max(0, serviceAmount - amountReceived);
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

const colFor = (bucket: Bucket) => `registry_${bucket}`;

/**
 * Subscribe to live record updates for a bucket.
 * Returns an unsubscribe function (use in useEffect cleanup).
 */
export function subscribeToRecords(
  bucket: Bucket,
  cb: (records: RegistryRecord[]) => void,
): () => void {
  const q = query(collection(db, colFor(bucket)), orderBy("srNo"));
  return onSnapshot(q, (snap) => {
    const records = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as RegistryRecord))
      .filter((r) => !r.isDeleted); // Hide soft-deleted records
    cb(records);
  });
}

/** Upsert a record (creates if new, updates if exists). */
export async function saveRecord(
  bucket: Bucket,
  record: RegistryRecord,
  actor?: string,
): Promise<void> {
  // Get existing record to track changes
  const existingDoc = await getDoc(doc(db, colFor(bucket), record.id));

  const existing = existingDoc.exists()
    ? (existingDoc.data() as RegistryRecord)
    : null;

  // Track field changes for important fields
  const tracked = [
    "status",
    "assignee",
    "priority",
    "work",
    "application",
    "serviceAmount",
    "amountReceived",
    "paymentDate",
    "paymentStatus",
    "serviceType",
    "serviceStatus",
    "serviceDueDate",
  ];
  const activities: ActivityLog[] = [];

  if (existing && actor) {
    for (const field of tracked) {
      const oldVal = (existing as any)[field];
      const newVal = (record as any)[field];
      if (oldVal !== newVal && newVal !== undefined && newVal !== "") {
        activities.push(
          createActivity(
            actor,
            `Updated ${field}`,
            field,
            String(oldVal ?? "—"),
            String(newVal),
          ),
        );
      }
    }
  }

  // CRITICAL: Normalize serviceType / services before saving. Support both
  // legacy `serviceType` and new `services[]` field. The DB will be updated
  // with `services` for multi-service support while keeping `serviceType`
  // for backward compatibility (set to first service if present).
  const normalizedServices: ServiceType[] = [];

  if (Array.isArray(record.services) && record.services.length > 0) {
    for (const s of record.services) {
      const n = normalizeServiceType(s);
      if (n) normalizedServices.push(n);
    }
  }

  if (record.serviceType && normalizedServices.length === 0) {
    const n = normalizeServiceType(record.serviceType);
    if (n) normalizedServices.push(n);
    else {
      console.error(
        "[saveRecord] ERROR: Invalid serviceType provided - normalization failed!",
        { inputServiceType: record.serviceType, validServiceTypes: SERVICE_TYPES },
      );
      throw new Error(`Invalid serviceType: "${record.serviceType}". Valid types are: ${SERVICE_TYPES.join(", ")}`);
    }
  }

  const normalized = {
    ...record,
    services: normalizedServices.length > 0 ? normalizedServices : undefined,
    // Keep legacy serviceType set to first normalized service (if any) for compatibility
    serviceType: normalizedServices.length > 0 ? normalizedServices[0] : undefined,
  };

  // Prepare data with updated metadata
  const now = new Date().toISOString();
  const data = {
    ...normalized,
    lastUpdatedBy: actor,
    lastUpdatedAt: now,
    activityLogs: existing?.activityLogs
      ? [...existing.activityLogs, ...activities]
      : activities,
  };

  // Also write detailed per-field activity logs to a separate collection for audit
  if (activities.length > 0 && record.id && actor) {
    try {
      const logsCol = collection(db, "client_activity_logs");
      for (const act of activities) {
        await addDoc(logsCol, {
          clientId: record.id,
          userId: actor,
          userName: actor,
          action: act.action,
          field: act.field || null,
          oldValue: act.oldValue || null,
          newValue: act.newValue || null,
          timestamp: act.timestamp,
        });
      }
    } catch (err) {
      console.error("[saveRecord] Failed to write client_activity_logs entries:", err);
    }
  }

  const { id, ...updateData } = data;

  // Apply uppercase forcing if the setting is enabled. This affects only
  // the current save operation (create/edit/import) and does not modify
  // existing records unless they are being updated now.
  try {
    if (getForceCapsSetting()) {
      for (const field of CAPITALIZE_FIELDS) {
        if ((updateData as any)[field]) {
          (updateData as any)[field] = transformInput((updateData as any)[field], true);
        }
      }
    }
  } catch (err) {
    // If settings aren't available (e.g., server-side), skip gracefully
    console.warn("[saveRecord] Could not apply force-caps setting:", err);
  }

  await setDoc(doc(db, colFor(bucket), id), updateData, { merge: true });
}

/** Check for possible duplicate entries (same mvNo and work). */
export async function checkForDuplicates(
  bucket: Bucket,
  mvNo: string,
  work: string,
): Promise<RegistryRecord[]> {
  if (!mvNo || !work) return [];

  const q = query(
    collection(db, colFor(bucket)),
    where("mvNo", "==", mvNo),
    where("work", "==", work),
  );

  const snap = await getDocs(q);
  // Filter out deleted records
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as RegistryRecord))
    .filter((r) => !r.isDeleted);
}

/** Soft-delete a record (admin only). */
export async function softDeleteRecord(
  bucket: Bucket,
  id: string,
  actor: string,
  reason: DeleteReason,
): Promise<void> {
  const now = new Date().toISOString();
  const deleteLog = createActivity(
    actor,
    "Record deleted",
    "deleteReason",
    "",
    reason,
  );

  await updateDoc(doc(db, colFor(bucket), id), {
    isDeleted: true,
    deletedAt: now,
    deletedBy: actor,
    deleteReason: reason,
    activityLogs: arrayUnion(deleteLog),
  });
}

/** Hard-delete a record (internal use only, not exposed to UI). */
export async function deleteRecord(bucket: Bucket, id: string): Promise<void> {
  await deleteDoc(doc(db, colFor(bucket), id));
}

/** Add an attachment to a client record. */
export async function addAttachment(
  bucket: Bucket,
  recordId: string,
  attachment: RecordAttachment,
): Promise<void> {
  const now = new Date().toISOString();
  const entry = createActivity(
    attachment.uploadedBy,
    `Attached ${attachment.name}`,
    "attachment",
    "",
    attachment.name,
  );

  const updates = {
    attachments: arrayUnion(attachment),
    lastUpdatedBy: attachment.uploadedBy,
    lastUpdatedAt: now,
    activityLogs: arrayUnion(entry),
  };

  console.error("[addAttachment] Uploading attachment:", {
    bucket,
    recordId,
    attachmentName: attachment.name,
    attachmentSize: attachment.size,
    storagePath: attachment.storagePath,
  });

  await updateDoc(doc(db, colFor(bucket), recordId), updates);
}

// ─── Legacy stubs (kept so non-updated call-sites don't break at compile time) ─

/**
 * @deprecated Use subscribeToRecords() for live data.
 * Returns an empty array — components using this need migrating.
 */
export function loadRecords(_bucket: Bucket): RegistryRecord[] {
  return [];
}

/**
 * @deprecated Use saveRecord() for individual writes.
 */
export async function saveRecords(bucket: Bucket, records: RegistryRecord[]): Promise<void> {
  await Promise.all(records.map((r) => saveRecord(bucket, r)));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function emptyRecord(srNo: number): RegistryRecord {
  return {
    id: crypto.randomUUID(),
    srNo,
    date: new Date().toISOString().slice(0, 10),
    mvNo: "",
    application: "",
    work: "",
    name: "",
    status: "Pending",
    mo: "",
    insurance: "",
    fitness: "",
    tax: "",
    co: "",
    assignee: "",
    // Accounting defaults
    serviceAmount: 0,
    amountReceived: 0,
    paymentDate: "",
    paymentStatus: "Unpaid",
  };
}

export const STATUS_OPTIONS: RecordStatus[] = [
  "Pending",
  "In Progress",
  "Completed",
  "On Hold",
];
