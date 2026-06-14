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
} from "firebase/firestore";
import { db } from "./firebase";
import { createActivity, type ActivityLog } from "./activity";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecordStatus = "Pending" | "In Progress" | "Completed" | "On Hold";

export type DeleteReason = "Duplicate Entry" | "Wrong Customer" | "Testing Data" | "Other";

export type PaymentStatus = "Paid" | "Partially Paid" | "Unpaid";

export type ServiceType = 
  | "Insurance"
  | "Fitness"
  | "Permit"
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
  "Permit",
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
  permit: "Permit",
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
  serviceType?: ServiceType; // Type of service (Insurance, Fitness, Permit, etc.)
  serviceStatus?: ServiceStatus; // Service-specific status
  serviceDueDate?: string; // ISO date string for service renewal
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
    "Permit": "📜 Permit",
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
    "Permit": "bg-purple-500",
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

  // CRITICAL: Normalize serviceType before saving
  const normalized = {
    ...record,
    serviceType: record.serviceType ? normalizeServiceType(record.serviceType) : undefined,
  };
  
  // Validation: Ensure serviceType is properly normalized
  if (record.serviceType) {
    if (!normalized.serviceType) {
      console.error(
        "[saveRecord] ERROR: Invalid serviceType provided - normalization failed!",
        {
          inputServiceType: record.serviceType,
          normalizedServiceType: normalized.serviceType,
          validServiceTypes: SERVICE_TYPES,
        },
      );
      throw new Error(
        `Invalid serviceType: "${record.serviceType}". Valid types are: ${SERVICE_TYPES.join(", ")}`
      );
    }
    
    console.log(
      `[saveRecord] ${existing ? "UPDATE" : "CREATE"}: Normalizing serviceType`,
      {
        bucket,
        recordId: record.id,
        clientName: record.name,
        inputServiceType: record.serviceType,
        normalizedServiceType: normalized.serviceType,
        match: record.serviceType === normalized.serviceType,
      },
    );

    // Validation: Check if normalization changed the value
    if (record.serviceType !== normalized.serviceType) {
      console.warn(
        `[saveRecord] WARNING: serviceType was normalized from "${record.serviceType}" to "${normalized.serviceType}"`,
      );
    }
  }

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

  const { id, ...updateData } = data;
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
