// Shared record schema for Clients & Leads with localStorage persistence.
export type RecordStatus = "Pending" | "In Progress" | "Completed" | "On Hold";

export interface RegistryRecord {
  id: string;
  srNo: number;
  date: string; // yyyy-mm-dd
  mvNo: string;
  application: string;
  work: string;
  name: string;
  status: RecordStatus;
  mo: string; // mobile
  insurance: string; // expiry date or status
  fitness: string;
  tax: string;
  co: string; // c/o
}

export type Bucket = "clients" | "leads" | "applications" | "customers";

const keyFor = (b: Bucket) => `registry-${b}`;

const seedClients: RegistryRecord[] = [
  { id: "c1", srNo: 1, date: "2026-05-02", mvNo: "MH12AB1234", application: "Renewal", work: "Insurance + Fitness", name: "Vikram Malhotra", status: "Completed", mo: "9876501234", insurance: "2027-05-01", fitness: "2027-04-20", tax: "Paid", co: "Rajesh M." },
  { id: "c2", srNo: 2, date: "2026-05-09", mvNo: "MH14XY7788", application: "Transfer", work: "Ownership transfer", name: "Anita Desai", status: "In Progress", mo: "9876512345", insurance: "2026-11-12", fitness: "2026-09-30", tax: "Due", co: "—" },
  { id: "c3", srNo: 3, date: "2026-05-14", mvNo: "MH04CD9090", application: "Permit", work: "Commercial permit", name: "Karan Deshmukh", status: "Pending", mo: "9876523456", insurance: "2026-08-21", fitness: "2026-12-15", tax: "Paid", co: "Logistics Co." },
];

const seedLeads: RegistryRecord[] = [
  { id: "l1", srNo: 1, date: "2026-05-15", mvNo: "—", application: "Inquiry", work: "New registration", name: "Priya Shah", status: "Pending", mo: "9988776655", insurance: "—", fitness: "—", tax: "—", co: "—" },
  { id: "l2", srNo: 2, date: "2026-05-16", mvNo: "MH02EF3344", application: "Inquiry", work: "Insurance renewal", name: "Sandeep Kulkarni", status: "In Progress", mo: "9123456780", insurance: "2026-06-30", fitness: "—", tax: "—", co: "—" },
];

const seedFor = (b: Bucket): RegistryRecord[] => {
  if (b === "clients") return seedClients;
  if (b === "leads") return seedLeads;
  return [];
};

export function loadRecords(bucket: Bucket): RegistryRecord[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(keyFor(bucket));
  if (!raw) {
    const seed = seedFor(bucket);
    localStorage.setItem(keyFor(bucket), JSON.stringify(seed));
    return seed;
  }
  try { return JSON.parse(raw) as RegistryRecord[]; } catch { return []; }
}

export function saveRecords(bucket: Bucket, records: RegistryRecord[]) {
  localStorage.setItem(keyFor(bucket), JSON.stringify(records));
}

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
  };
}

export const STATUS_OPTIONS: RecordStatus[] = ["Pending", "In Progress", "Completed", "On Hold"];
