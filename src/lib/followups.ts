import { type RegistryRecord, getRecordServiceDetails, type ServiceDetail } from "./records";

export interface FollowUpEntry {
  clientId: string;
  clientName: string;
  mvNo?: string;
  mobile?: string;
  assignee?: string;
  serviceType: string;
  dueDate?: string; // ISO or YYYY-MM-DD
  status?: string;
  daysRemaining?: number; // negative => overdue
}

function toDate(d?: string): Date | null {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function daysBetween(a: Date, b: Date) {
  const ms = b.setHours(0, 0, 0, 0) - a.setHours(0, 0, 0, 0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function flattenServices(records: RegistryRecord[]): FollowUpEntry[] {
  const now = new Date();
  const out: FollowUpEntry[] = [];

  for (const r of records) {
    const services = getRecordServiceDetails(r) as ServiceDetail[];
    for (const s of services) {
      const due = toDate(s.dueDate || "");
      const entry: FollowUpEntry = {
        clientId: r.id,
        clientName: r.name,
        mvNo: r.mvNo,
        mobile: r.mo,
        assignee: r.assignee,
        serviceType: s.serviceType,
        dueDate: s.dueDate || undefined,
        status: s.status,
      };

      if (due) {
        entry.daysRemaining = daysBetween(now, new Date(due));
      }

      out.push(entry);
    }
  }

  return out;
}

export function computeFollowUps(records: RegistryRecord[]) {
  const flat = flattenServices(records);
  const today: FollowUpEntry[] = [];
  const upcoming7: FollowUpEntry[] = [];
  const upcoming15: FollowUpEntry[] = [];
  const upcoming30: FollowUpEntry[] = [];
  const overdue: FollowUpEntry[] = [];

  for (const e of flat) {
    if (e.dueDate && typeof e.daysRemaining === "number") {
      const d = e.daysRemaining;
      if (d === 0) today.push(e);
      else if (d > 0 && d <= 7) upcoming7.push(e);
      else if (d > 7 && d <= 15) upcoming15.push(e);
      else if (d > 15 && d <= 30) upcoming30.push(e);
      else if (d < 0) overdue.push(e);
    }
  }

  const totalActiveServices = flat.filter((f) => (f.status || "") !== "Completed").length;

  return {
    flat,
    today,
    upcoming7,
    upcoming15,
    upcoming30,
    overdue,
    totals: {
      today: today.length,
      upcoming7: upcoming7.length,
      upcoming15: upcoming15.length,
      upcoming30: upcoming30.length,
      overdue: overdue.length,
      totalActiveServices,
    },
  };
}

export default { flattenServices, computeFollowUps };
