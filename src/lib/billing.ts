import { db, storage } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  addDoc,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { logClientActivity } from "./activity";
import type { RegistryRecord } from "./records";

export type InvoiceServiceItem = {
  serviceId: string;
  serviceName: string;
  vehicleNumber?: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  tax: number;
  total: number;
};

export type Invoice = {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  clientMobile?: string;
  clientAddress?: string;
  vehicleNumber?: string;
  vehicleType?: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotal: number;
  totalTax: number;
  totalAmount: number;
  invoiceDate: string;
  createdBy: string;
  createdAt: string;
  status: "Pending" | "Partially Paid" | "Paid" | "Cancelled";
  services: InvoiceServiceItem[];
  totalPaid?: number;
  pdfUrl?: string;
};

export interface BillingMetrics {
  totalInvoiced: number;
  totalCollected: number;
  outstandingAmount: number;
  invoicesThisMonth: number;
  pendingInvoices: number;
  overdueInvoices: number;
  collectionRate: number;
}

export interface BillingPeriodInfo {
  invoiceId: string;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
}

const INVOICES_COL = "invoices";
const COUNTERS_COL = "counters";
const INVOICE_LOGS_COL = "invoiceLogs";

function pad(num: number, size = 4) {
  return num.toString().padStart(size, "0");
}

function formatDateToIso(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeBillingDate(value: unknown): Date | null {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as any).toDate === "function") {
    const date = (value as any).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // ONLY accept strict YYYY-MM-DD ISO format from date inputs
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [yearStr, monthStr, dayStr] = raw.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    
    // Validate ranges
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      console.warn(`[normalizeBillingDate] Invalid date components: ${raw}`);
      return null;
    }
    
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  // Fallback: try DD-MM-YYYY from manual input (but prefer ISO format)
  const dmy = /^([0-3]?\d)[-\/]([0-1]?\d)[-\/](\d{4})$/.exec(raw);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || year > 2099) {
      console.warn(`[normalizeBillingDate] Invalid DD-MM-YYYY date: ${raw}`);
      return null;
    }
    
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  console.warn(`[normalizeBillingDate] Unable to parse: ${raw}`);
  return null;
}

function addDays(value: Date, days: number): Date {
  const next = new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate() + days
  ));
  return next;
}

export async function getNextBillingStartDate(clientId: string): Promise<string> {
  try {
    const latest = await getLatestBillingPeriod(clientId);
    if (!latest) {
      // No previous invoice - suggest today
      const today = new Date();
      const isoDate = formatDateToIso(today);
      console.log({ step: "NEXT_BILLING_START_NO_PREV", clientId, suggestedDate: isoDate });
      return isoDate;
    }
    
    const lastEndDate = normalizeBillingDate(latest.periodEnd);
    if (!lastEndDate) {
      console.warn({ step: "NEXT_BILLING_START_PARSE_FAILED", clientId, rawEnd: latest.periodEnd });
      const today = new Date();
      return formatDateToIso(today);
    }
    
    const nextDate = addDays(lastEndDate, 1);
    const isoDate = formatDateToIso(nextDate);
    console.log({ step: "NEXT_BILLING_START_COMPUTED", clientId, lastEnd: formatDateToIso(lastEndDate), nextStart: isoDate });
    return isoDate;
  } catch (err) {
    console.error({ step: "NEXT_BILLING_START_ERROR", clientId, err });
    const today = new Date();
    return formatDateToIso(today);
  }
}

function formatBillingDate(value: unknown): string {
  const date = normalizeBillingDate(value);
  return date ? formatDateToIso(date) : "";
}

function parseTimestamp(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as any).toDate === "function") {
    return (value as any).toDate().toISOString();
  }
  return String(value);
}

async function getNextInvoiceNumber(year: number) {
  const counterRef = doc(db, COUNTERS_COL, `invoices-${year}`);
  const nextCount = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef as any);
    let current = 0;
    if (snap.exists()) {
      const data = snap.data() as any;
      current = data.last || 0;
    }
    const next = current + 1;
    tx.set(counterRef as any, { last: next }, { merge: true });
    return next;
  });
  return `INV-${year}-${pad(nextCount, 4)}`;
}

export async function getLatestBillingPeriod(clientId: string): Promise<BillingPeriodInfo | null> {
  const q = query(
    collection(db, INVOICES_COL),
    where("clientId", "==", clientId),
    orderBy("billingPeriodEnd", "desc"),
    limit(1),
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  const data = docSnap.data() as Invoice;

  return {
    invoiceId: docSnap.id,
    invoiceNumber: data.invoiceNumber,
    periodStart: data.billingPeriodStart,
    periodEnd: data.billingPeriodEnd,
  };
}

export async function validateBillingPeriodSequence(
  clientId: string,
  billingPeriodStart: string,
  billingPeriodEnd: string,
): Promise<{ valid: boolean; reason?: string }> {
  const startDate = normalizeBillingDate(billingPeriodStart);
  const endDate = normalizeBillingDate(billingPeriodEnd);
  const start = startDate ? formatDateToIso(startDate) : "";
  const end = endDate ? formatDateToIso(endDate) : "";

  console.log({
    step: "VALIDATE_PERIOD_START",
    clientId,
    inputStart: billingPeriodStart,
    inputEnd: billingPeriodEnd,
    parsedStart: start,
    parsedEnd: end,
  });

  if (!startDate || !endDate) {
    console.error({
      step: "VALIDATE_PERIOD_FAILED_PARSE",
      clientId,
      inputStart: billingPeriodStart,
      inputEnd: billingPeriodEnd,
      reason: "Failed to parse one or both dates",
    });
    return { valid: false, reason: "Invalid billing dates provided." };
  }

  if (startDate >= endDate) {
    console.error({
      step: "VALIDATE_PERIOD_FAILED_ORDER",
      clientId,
      parsedStart: start,
      parsedEnd: end,
      startTime: startDate.getTime(),
      endTime: endDate.getTime(),
      reason: "Start date must be before end date",
    });
    return { valid: false, reason: "Billing start date must be before end date." };
  }

  const q = query(
    collection(db, INVOICES_COL),
    where("clientId", "==", clientId),
    orderBy("billingPeriodStart", "asc"),
  );
  const snap = await getDocs(q);
  const invoices = snap.docs.map((d) => d.data() as Invoice);

  for (const inv of invoices) {
    const invStartDate = normalizeBillingDate(inv.billingPeriodStart);
    const invEndDate = normalizeBillingDate(inv.billingPeriodEnd);
    if (!invStartDate || !invEndDate) {
      continue;
    }

    if (!(endDate < invStartDate || startDate > invEndDate)) {
      return { valid: false, reason: "Billing period overlaps with existing invoice." };
    }
  }

  if (invoices.length > 0) {
    const endDates = invoices
      .map((inv) => normalizeBillingDate(inv.billingPeriodEnd))
      .filter((date): date is Date => date !== null);
    const lastEndDate = endDates.reduce((latest, date) => (latest && latest > date ? latest : date), endDates[0]);
    console.debug({
      step: "LAST_INVOICE_END_COMPUTED",
      clientId,
      lastEndDate: lastEndDate ? formatDateToIso(lastEndDate) : null,
      invoicesCount: invoices.length,
    });
    if (!lastEndDate) {
      return { valid: true };
    }

    const expectedNextStart = addDays(lastEndDate, 1);
    if (startDate <= lastEndDate) {
      return { valid: false, reason: `Billing period must start after last invoice end (${formatDateToIso(lastEndDate)}).` };
    }

    if (startDate.getTime() > expectedNextStart.getTime()) {
      return {
        valid: false,
        reason: `Billing period should begin immediately after the last invoice end date (${formatDateToIso(expectedNextStart)}).`,
      };
    }
  }

  return { valid: true };
}

export async function createInvoice(
  client: RegistryRecord,
  services: InvoiceServiceItem[],
  billingPeriodStart: string,
  billingPeriodEnd: string,
  createdBy: string,
): Promise<Invoice> {
  const validation = await validateBillingPeriodSequence(client.id, billingPeriodStart, billingPeriodEnd);
  if (!validation.valid) {
    throw new Error(validation.reason || "Invalid billing period");
  }

  const subtotal = services.reduce((sum, item) => sum + (item.amount || 0), 0);
  const totalTax = services.reduce((sum, item) => sum + (item.tax || 0), 0);
  const totalAmount = subtotal + totalTax;
  const invoiceNumber = await getNextInvoiceNumber(new Date().getFullYear());
  const invoiceDate = new Date().toISOString();

  const invoicePayload = {
    invoiceNumber,
    clientId: client.id,
    clientName: client.name,
    clientMobile: client.mo || null,
    clientAddress: client.application || null,
    vehicleNumber: client.mvNo || null,
    vehicleType: (client as any).vehicleType || client.work || null,
    billingPeriodStart: formatBillingDate(billingPeriodStart),
    billingPeriodEnd: formatBillingDate(billingPeriodEnd),
    subtotal,
    totalTax,
    totalAmount,
    invoiceDate,
    createdBy,
    createdAt: serverTimestamp(),
    status: "Pending",
    services,
    totalPaid: 0,
  } as any;

  console.log({
    source: "createInvoice payload",
    clientId: client.id,
    billingPeriodStart: invoicePayload.billingPeriodStart,
    billingPeriodEnd: invoicePayload.billingPeriodEnd,
    services,
    subtotal,
    totalTax,
    totalAmount,
    invoiceNumber,
  });

  const docRef = await addDoc(collection(db, INVOICES_COL), invoicePayload);

  try {
    await logClientActivity(
      client.id,
      createdBy,
      createdBy,
      `Invoice generated: ${invoiceNumber}`,
      "invoice",
      null,
      `${invoiceNumber} - ₹${totalAmount}`,
    );
  } catch (err) {
    console.warn("[createInvoice] logClientActivity failed:", err);
  }

  return {
    id: docRef.id,
    invoiceNumber,
    clientId: client.id,
    clientName: client.name,
    clientMobile: client.mo || undefined,
    clientAddress: client.application || undefined,
    vehicleNumber: client.mvNo || undefined,
    vehicleType: (client as any).vehicleType || client.work || undefined,
    billingPeriodStart: formatBillingDate(billingPeriodStart),
    billingPeriodEnd: formatBillingDate(billingPeriodEnd),
    subtotal,
    totalTax,
    totalAmount,
    invoiceDate,
    createdBy,
    createdAt: invoiceDate,
    status: "Pending",
    services,
    totalPaid: 0,
  };
}

export function subscribeToClientInvoices(clientId: string, callback: (invoices: Invoice[]) => void) {
  const q = query(collection(db, INVOICES_COL), where("clientId", "==", clientId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice)));
  }, (error) => {
    console.error("[subscribeToClientInvoices]", error);
    callback([]);
  });
}

export function subscribeToAllInvoices(callback: (invoices: Invoice[]) => void) {
  const q = query(collection(db, INVOICES_COL), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice)));
  }, (error) => {
    console.error("[subscribeToAllInvoices]", error);
    callback([]);
  });
}

export async function getInvoiceById(invoiceId: string): Promise<Invoice | null> {
  const invoiceDoc = doc(db, INVOICES_COL, invoiceId);
  const snap = await getDoc(invoiceDoc);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Invoice;
}

export async function updateInvoiceStatus(
  invoiceId: string,
  amountPaid: number,
  totalAmount: number,
  updatedBy: string,
): Promise<void> {
  const invoiceDocRef = doc(db, INVOICES_COL, invoiceId);

  let newStatus: Invoice["status"] = "Pending";
  if (amountPaid >= totalAmount) {
    newStatus = "Paid";
  } else if (amountPaid > 0) {
    newStatus = "Partially Paid";
  }

  await updateDoc(invoiceDocRef, { status: newStatus });

  try {
    await logClientActivity(
      invoiceId,
      updatedBy,
      updatedBy,
      `Invoice status updated to: ${newStatus}`,
      "status",
      null,
      newStatus,
    );
  } catch (err) {
    console.warn("[updateInvoiceStatus] logClientActivity failed:", err);
  }
}

export async function calculateBillingMetrics(): Promise<BillingMetrics> {
  const snap = await getDocs(collection(db, INVOICES_COL));
  const invoices = snap.docs.map((d) => d.data() as Invoice);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let totalInvoiced = 0;
  let totalCollected = 0;
  let invoicesThisMonth = 0;
  let pendingCount = 0;
  let overdueCount = 0;

  for (const invoice of invoices) {
    totalInvoiced += invoice.totalAmount || 0;
    totalCollected += invoice.totalPaid || 0;

    const createdAt = parseTimestamp(invoice.createdAt);
    const createdDate = new Date(createdAt);
    if (!Number.isNaN(createdDate.getTime()) && createdDate.getMonth() === currentMonth && createdDate.getFullYear() === currentYear) {
      invoicesThisMonth += 1;
    }

    if (invoice.status === "Pending" || invoice.status === "Partially Paid") {
      pendingCount += 1;
      const endDate = new Date(invoice.billingPeriodEnd);
      if (!Number.isNaN(endDate.getTime()) && endDate < now) {
        overdueCount += 1;
      }
    }
  }

  const outstandingAmount = totalInvoiced - totalCollected;
  const collectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0;

  return {
    totalInvoiced,
    totalCollected,
    outstandingAmount,
    invoicesThisMonth,
    pendingInvoices: pendingCount,
    overdueInvoices: overdueCount,
    collectionRate,
  };
}

export async function attachPdfToInvoice(invoiceId: string, blob: Blob): Promise<string> {
  const ref = storageRef(storage, `invoices/${invoiceId}.pdf`);
  await uploadBytes(ref, blob);
  const url = await getDownloadURL(ref);
  await updateDoc(doc(db, INVOICES_COL, invoiceId), { pdfUrl: url });

  try {
    await addDoc(collection(db, INVOICE_LOGS_COL), {
      invoiceId,
      action: "PDF Generated",
      user: "system",
      timestamp: serverTimestamp(),
    } as any);
  } catch (err) {
    console.warn("[attachPdfToInvoice] Failed to write invoice log:", err);
  }

  return url;
}

export async function getClientBillingSummary(clientId: string) {
  const q = query(collection(db, INVOICES_COL), where("clientId", "==", clientId), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  const invoices = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice));

  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalPaid = invoices.filter((inv) => inv.status === "Paid").reduce((sum, inv) => sum + inv.totalAmount, 0);
  const outstandingAmount = totalInvoiced - totalPaid;

  return {
    totalInvoices: invoices.length,
    totalInvoiced,
    totalPaid,
    outstandingAmount,
    recentInvoices: invoices.slice(0, 5),
    pendingInvoices: invoices.filter((inv) => inv.status === "Pending" || inv.status === "Partially Paid"),
  };
}
