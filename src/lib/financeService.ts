// src/lib/financeService.ts
import { db } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
import { verifyAdminPin } from "./adminSecurity";
import { subscribeToAllInvoices } from "./billing";
import { toast } from "sonner";

export function handleFirestoreError(err: any, context: string) {
  console.error(`[Firestore Error: ${context}]`, err);
  if (err && (err.code === "failed-precondition" || err.message?.includes("index"))) {
    toast.error("Database index is being prepared. Please try again shortly.");
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinanceRecord {
  id: string; // Matches Invoice ID
  clientId: string;
  clientName: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceAmount: number;
  receivedAmount: number;
  balanceAmount: number;
  collectionDate: string; // YYYY-MM-DD
  paymentStatus: "Pending" | "Partially Paid" | "Paid";
  askBhaylubha: boolean;
  approvedBy?: string | null;
  approvedAt?: string | null;
  approvedRemarks?: string | null;
  receivedBy?: string | null;
  paymentMethod?: string | null;
  accountName?: string | null;
  remarks?: string | null;
  createdAt: string;
  updatedAt: string;
  assignedEmployee?: string;
  daysOverdue?: number;
}

export interface PaymentHistoryItem {
  id?: string;
  financeRecordId: string;
  invoiceId: string;
  amount: number;
  method: "Cash" | "UPI" | "Bank Transfer" | "Cheque" | "Online";
  receivedBy: string;
  receivedAt: string;
  accountName: "Cash Account" | "ICICI Bank" | "HDFC Bank" | "Axis Bank" | "SBI" | "Other";
  remarks: string;
}

export interface LedgerEntry {
  id?: string;
  timestamp: string;
  type: "Debit" | "Credit";
  amount: number;
  account: string; // Cash, Bank, UPI, Cheque
  balance: number;
  referenceId: string; // Payment ID or Invoice ID
  remarks: string;
}

export interface FinanceAuditLog {
  id?: string;
  action:
    | "Payment Added"
    | "Payment Updated"
    | "Invoice Deleted"
    | "Collection Date Changed"
    | "Approval Granted"
    | "Approval Removed";
  performedBy: string;
  timestamp: string;
  recordId: string;
  remarks: string;
}

// ─── Collections ──────────────────────────────────────────────────────────────

const FINANCE_COL = "finance_records";
const PAYMENTS_COL = "payment_history";
const LEDGER_COL = "accounts_ledger";
const AUDIT_COL = "finance_audit_logs";
const INVOICES_COL = "billing_invoices";

// ─── Audit Logger ─────────────────────────────────────────────────────────────

export async function logFinanceAction(
  action: FinanceAuditLog["action"],
  performedBy: string,
  recordId: string,
  remarks: string,
) {
  try {
    await addDoc(collection(db, AUDIT_COL), {
      action,
      performedBy,
      timestamp: new Date().toISOString(),
      recordId,
      remarks,
    });
  } catch (err) {
    console.error("[logFinanceAction] Failed:", err);
  }
}

// ─── Sync / Init Helpers ──────────────────────────────────────────────────────

/**
 * Ensures a finance record exists for a given invoice.
 * If not, creates one. Otherwise returns the existing one.
 */
export async function ensureFinanceRecord(invoice: any): Promise<FinanceRecord> {
  const fDocRef = doc(db, FINANCE_COL, invoice.id);
  const fSnap = await getDoc(fDocRef);

  if (fSnap.exists()) {
    return { id: fSnap.id, ...fSnap.data() } as FinanceRecord;
  }

  // Create new finance record mapping to the invoice
  const record: FinanceRecord = {
    id: invoice.id,
    clientId: invoice.clientId,
    clientName: invoice.clientName || "Unknown Client",
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceAmount: invoice.totalAmount,
    receivedAmount: invoice.totalPaid || 0,
    balanceAmount: invoice.totalAmount - (invoice.totalPaid || 0),
    collectionDate: invoice.collectionDate || new Date().toISOString().slice(0, 10),
    paymentStatus: invoice.status === "Paid" ? "Paid" : (invoice.totalPaid > 0 ? "Partially Paid" : "Pending"),
    askBhaylubha: !!invoice.askBhaylubha,
    createdAt: invoice.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assignedEmployee: invoice.createdBy || "System",
  };

  await setDoc(fDocRef, record);
  return record;
}

// ─── Finance Records Read ────────────────────────────────────────────────────

export function subscribeFinanceRecords(cb: (records: FinanceRecord[]) => void) {
  return onSnapshot(
    collection(db, FINANCE_COL),
    async (snapshot) => {
      const list: FinanceRecord[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as FinanceRecord;
        // Calculate days overdue
        let daysOverdue = 0;
        if (data.paymentStatus !== "Paid" && data.collectionDate) {
          const due = new Date(data.collectionDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          due.setHours(0, 0, 0, 0);
          if (today.getTime() > due.getTime()) {
            daysOverdue = Math.ceil((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
          }
        }
        list.push({ ...data, id: d.id, daysOverdue });
      });
      cb(list);
    },
    (err) => handleFirestoreError(err, "subscribeFinanceRecords"),
  );
}

// ─── Collection Date Scheduling ──────────────────────────────────────────────

export async function updateRecordCollectionDate(
  recordId: string,
  date: string,
  performedBy: string,
) {
  const ref = doc(db, FINANCE_COL, recordId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Finance record not found");

  const oldVal = snap.data().collectionDate || "None";
  await updateDoc(ref, {
    collectionDate: date,
    updatedAt: new Date().toISOString(),
  });

  // Keep parent invoice collectionDate in sync
  try {
    await updateDoc(doc(db, INVOICES_COL, recordId), {
      collectionDate: date,
    });
  } catch (e) {
    console.warn("Could not sync invoice collectionDate:", e);
  }

  await logFinanceAction(
    "Collection Date Changed",
    performedBy,
    recordId,
    `Changed collection date from ${oldVal} to ${date}`,
  );
}

// ─── Bhaylubha Approval Logic ────────────────────────────────────────────────

export async function setBhaylubhaRequirement(
  recordId: string,
  required: boolean,
  performedBy: string,
) {
  const ref = doc(db, FINANCE_COL, recordId);
  await updateDoc(ref, {
    askBhaylubha: required,
    updatedAt: new Date().toISOString(),
  });

  // Keep parent invoice askBhaylubha in sync
  try {
    await updateDoc(doc(db, INVOICES_COL, recordId), {
      askBhaylubha: required,
    });
  } catch (e) {
    console.warn("Could not sync invoice askBhaylubha flag:", e);
  }

  await logFinanceAction(
    required ? "Approval Removed" : "Approval Granted",
    performedBy,
    recordId,
    required ? "Enabled Bhaylubha approval requirement" : "Disabled/Cleared Bhaylubha approval requirement",
  );
}

export async function approveRecordBhaylubha(
  recordId: string,
  approvedBy: string,
  remarks: string,
) {
  const ref = doc(db, FINANCE_COL, recordId);
  await updateDoc(ref, {
    askBhaylubha: false, // Flag cleared when approved
    approvedBy,
    approvedAt: new Date().toISOString(),
    approvedRemarks: remarks,
    updatedAt: new Date().toISOString(),
  });

  // Keep parent invoice askBhaylubha in sync
  try {
    await updateDoc(doc(db, INVOICES_COL, recordId), {
      askBhaylubha: false,
    });
  } catch (e) {
    console.warn("Could not sync invoice askBhaylubha flag:", e);
  }

  await logFinanceAction(
    "Approval Granted",
    approvedBy,
    recordId,
    `Bhaylubha approval granted. Remarks: ${remarks}`,
  );
}

// ─── Payment Entry Recording ─────────────────────────────────────────────────

export async function recordPaymentEntry(
  recordId: string,
  payment: Omit<PaymentHistoryItem, "financeRecordId" | "invoiceId" | "receivedAt">,
) {
  const ref = doc(db, FINANCE_COL, recordId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Finance record not found");

  const data = snap.data() as FinanceRecord;

  // Validation: Received Amount <= Remaining Amount
  if (payment.amount > data.balanceAmount) {
    throw new Error(`Payment amount (₹${payment.amount}) exceeds remaining balance of ₹${data.balanceAmount}`);
  }

  if (payment.amount <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  // Prevent completion if approval is pending
  if (data.askBhaylubha && payment.amount === data.balanceAmount) {
    throw new Error("Cannot mark collection completed. Bhaylubha Approval is Pending.");
  }

  const newReceived = data.receivedAmount + payment.amount;
  const newBalance = data.invoiceAmount - newReceived;

  if (newBalance < 0) {
    throw new Error("Calculation error: Remaining balance cannot be less than 0");
  }

  const newStatus: FinanceRecord["paymentStatus"] =
    newBalance === 0 ? "Paid" : newReceived > 0 ? "Partially Paid" : "Pending";

  const timestamp = new Date().toISOString();

  // Create payment history doc
  const payCol = collection(db, PAYMENTS_COL);
  const payDocRef = await addDoc(payCol, {
    financeRecordId: recordId,
    invoiceId: data.invoiceId,
    amount: payment.amount,
    method: payment.method,
    receivedBy: payment.receivedBy,
    receivedAt: timestamp,
    accountName: payment.accountName,
    remarks: payment.remarks,
  });

  // Update finance record
  await updateDoc(ref, {
    receivedAmount: newReceived,
    balanceAmount: newBalance,
    paymentStatus: newStatus,
    receivedBy: payment.receivedBy,
    paymentMethod: payment.method,
    accountName: payment.accountName,
    remarks: payment.remarks,
    updatedAt: timestamp,
  });

  // Keep parent invoice status and paid amount in sync
  try {
    await updateDoc(doc(db, INVOICES_COL, recordId), {
      status: newStatus,
      totalPaid: newReceived,
    });
  } catch (e) {
    console.warn("Could not sync invoice status and payments:", e);
  }

  // Create accounts ledger entry
  await recordLedgerEntry({
    timestamp,
    type: "Debit", // Debit Cash/Bank to increase balance
    amount: payment.amount,
    account: payment.accountName,
    referenceId: payDocRef.id,
    remarks: `Payment for Invoice ${data.invoiceNumber}. Recv by ${payment.receivedBy}`,
  });

  await logFinanceAction(
    "Payment Added",
    payment.receivedBy,
    recordId,
    `Added payment of ₹${payment.amount} via ${payment.method} into ${payment.accountName}`,
  );
}

// ─── Accounts Ledger ─────────────────────────────────────────────────────────

export async function recordLedgerEntry(entry: Omit<LedgerEntry, "balance">) {
  // To compute the running balance, we query all ledger entries for this account
  const col = collection(db, LEDGER_COL);
  const q = query(col, where("account", "==", entry.account), orderBy("timestamp", "asc"));
  
  let currentBalance = 0;
  try {
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const data = d.data() as LedgerEntry;
      if (data.type === "Debit") {
        currentBalance += data.amount;
      } else {
        currentBalance -= data.amount;
      }
    });
  } catch (err: any) {
    console.warn("[recordLedgerEntry] Index query failed, falling back to 0 baseline balance:", err);
    if (err && (err.code === "failed-precondition" || err.message?.includes("index"))) {
      toast.error("Database index is being prepared. Ledger running balance may temporarily default to 0.");
    }
  }

  // Apply this transaction
  if (entry.type === "Debit") {
    currentBalance += entry.amount;
  } else {
    currentBalance -= entry.amount;
  }

  await addDoc(col, {
    ...entry,
    balance: currentBalance,
  });
}

export function subscribeLedgerEntries(cb: (entries: LedgerEntry[]) => void) {
  return onSnapshot(
    query(collection(db, LEDGER_COL), orderBy("timestamp", "desc")),
    (snapshot) => {
      const list: LedgerEntry[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as LedgerEntry);
      });
      cb(list);
    },
    (err) => handleFirestoreError(err, "subscribeLedgerEntries"),
  );
}

// ─── Payments History Read ────────────────────────────────────────────────────

export function subscribePaymentHistory(cb: (payments: PaymentHistoryItem[]) => void) {
  return onSnapshot(
    query(collection(db, PAYMENTS_COL), orderBy("receivedAt", "desc")),
    (snapshot) => {
      const list: PaymentHistoryItem[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as PaymentHistoryItem);
      });
      cb(list);
    },
    (err) => handleFirestoreError(err, "subscribePaymentHistory"),
  );
}

// ─── Secure Invoice Deletion ─────────────────────────────────────────────────

export async function deleteInvoiceSecured(
  invoiceId: string,
  pin: string,
  reason: string,
  userId: string,
  userRole: string,
) {
  if (userRole !== "admin") {
    throw new Error("Permission Denied: Only Admin users can delete invoices.");
  }

  const ok = await verifyAdminPin(pin);
  if (!ok) {
    throw new Error("Invalid Admin PIN");
  }

  const invoiceRef = doc(db, INVOICES_COL, invoiceId);
  const invoiceSnap = await getDoc(invoiceRef);
  if (!invoiceSnap.exists()) {
    throw new Error("Invoice not found");
  }
  const invData = invoiceSnap.data();

  const batch = writeBatch(db);

  // 1. Delete billing payments
  const paymentsSnap = await getDocs(
    query(collection(db, "billing_invoice_payments"), where("invoiceId", "==", invoiceId)),
  );
  paymentsSnap.forEach((d) => {
    batch.delete(d.ref);
  });

  // 2. Delete payment_history payments
  const financePaymentsSnap = await getDocs(
    query(collection(db, PAYMENTS_COL), where("invoiceId", "==", invoiceId)),
  );
  financePaymentsSnap.forEach((d) => {
    batch.delete(d.ref);
  });

  // 3. Delete finance record
  batch.delete(doc(db, FINANCE_COL, invoiceId));

  // 4. Delete invoice itself
  batch.delete(invoiceRef);

  await batch.commit();

  // Log to audit log
  await logFinanceAction(
    "Invoice Deleted",
    userId,
    invoiceId,
    `Deleted Invoice ${invData.invoiceNumber || invoiceId}. Reason: ${reason}`,
  );
}

// ─── Audit Log Read ──────────────────────────────────────────────────────────

export function subscribeAuditLogs(cb: (logs: FinanceAuditLog[]) => void) {
  return onSnapshot(
    query(collection(db, AUDIT_COL), orderBy("timestamp", "desc")),
    (snapshot) => {
      const list: FinanceAuditLog[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as FinanceAuditLog);
      });
      cb(list);
    },
    (err) => handleFirestoreError(err, "subscribeAuditLogs"),
  );
}

export function subscribeAndSyncFinance(cb: (records: FinanceRecord[]) => void) {
  const unsubInvoices = subscribeToAllInvoices(async (invoices) => {
    for (const inv of invoices) {
      try {
        await ensureFinanceRecord(inv);
      } catch (err) {
        console.error("Failed to sync finance record:", err);
      }
    }
  });

  const unsubFinance = subscribeFinanceRecords(cb);

  return () => {
    unsubInvoices();
    unsubFinance();
  };
}

