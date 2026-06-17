import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { subscribeToDocsFor, type CustomerDoc } from "@/lib/customerDocs";
import { subscribeToTasksForRecord } from "@/lib/tasks";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { formatActivityTime, type ActivityLog } from "@/lib/activity";
import { getRecordServices, getRecordServiceDetails, serviceLabel, type RegistryRecord } from "@/lib/records";

function normalizeActivityTimestamp(timestamp: unknown): string {
  if (!timestamp) return "";
  if (typeof timestamp === "string") return timestamp;
  if (timestamp instanceof Date) return timestamp.toISOString();
  if (typeof timestamp === "object" && timestamp !== null && "toDate" in timestamp && typeof (timestamp as any).toDate === "function") {
    return (timestamp as any).toDate().toISOString();
  }
  return String(timestamp);
}

function formatActivityDateParts(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "—" };
  return {
    date: date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  };
}

interface Props {
  record: RegistryRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientProfile({ record, open, onOpenChange }: Props) {
  const [docs, setDocs] = useState<CustomerDoc[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);

  useEffect(() => {
    if (!record) return;
    const unsubDocs = subscribeToDocsFor(record.id, setDocs);
    const unsubTasks = subscribeToTasksForRecord(record.id, setTasks);

    // Subscribe to client_activity_logs collection
    const q = query(collection(db, "client_activity_logs"), where("clientId", "==", record.id), orderBy("timestamp", "desc"));
    const unsubActs = onSnapshot(q, (snap) => {
      setActivities(
        snap.docs.map((d) => {
          const it = d.data() as any;
          return {
            id: d.id,
            actor: it.userName ?? it.userId ?? "",
            action: it.action ?? "",
            field: it.field,
            oldValue: it.oldValue,
            newValue: it.newValue,
            timestamp: normalizeActivityTimestamp(it.timestamp),
          };
        }),
      );
    });

    return () => {
      unsubDocs();
      unsubTasks();
      unsubActs();
    };
  }, [record]);

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Client Profile — {record.name}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
          <section>
            <h4 className="text-sm font-semibold border-b pb-1">Client & Vehicle Details</h4>
            <div className="mt-2 text-sm space-y-1">
              <div><strong>Full Name:</strong> {record.name}</div>
              <div><strong>Mobile Number:</strong> {record.mo}</div>
              <div><strong>Email:</strong> {record.groupName || "—"}</div>
              <div><strong>Address:</strong> {record.co || "—"}</div>
              <div><strong>Vehicle Number:</strong> {record.mvNo || "—"}</div>
              <div><strong>Chassis Number:</strong> {record.chassisNo || "—"}</div>
              <div><strong>Engine Number:</strong> {record.engineNo || "—"}</div>
              <div><strong>Created At:</strong> {record.date}</div>
              <div><strong>Created By:</strong> {record.lastUpdatedBy || "—"}</div>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold border-b pb-1">Service Information</h4>
            <div className="mt-2 space-y-2">
              {getRecordServiceDetails(record).map((service, index) => (
                <div key={index} className="text-sm border p-2 rounded bg-muted/10 flex justify-between items-center">
                  <div>
                    <span className="font-semibold">{serviceLabel(service.serviceType)}</span>
                    <span className="text-xs text-muted-foreground ml-2">({service.status})</span>
                  </div>
                  <div className="text-xs font-mono">
                    Due: {service.dueDate ? new Date(service.dueDate).toLocaleDateString("en-IN") : "—"}
                  </div>
                </div>
              ))}
              {getRecordServiceDetails(record).length === 0 && (
                <div className="text-xs text-muted-foreground">No services recorded.</div>
              )}
            </div>
          </section>

          <section className="md:col-span-2">
            <h4 className="text-sm font-semibold border-b pb-1">Documents</h4>
            <div className="mt-2 space-y-2">
              {docs.length === 0 && <div className="text-xs text-muted-foreground">No documents uploaded.</div>}
              {docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between border p-2 rounded">
                  <div className="text-sm">
                    <div className="font-medium">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{d.type} • {(d.fileSize||0)/1024|0} KB • {new Date(d.addedAt).toLocaleString()}</div>
                  </div>
                  <div className="flex gap-2">
                    {d.downloadURL && <a href={d.downloadURL} target="_blank" rel="noreferrer"><Button size="sm">View</Button></a>}
                    {d.storagePath && <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(d.storagePath || ""); }}>Copy Path</Button>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="md:col-span-2">
            <h4 className="text-sm font-semibold border-b pb-1">Active Tasks</h4>
            <div className="mt-2 space-y-2">
              {tasks.length === 0 && <div className="text-xs text-muted-foreground">No active tasks.</div>}
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between border p-2 rounded text-sm">
                  <div>
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs text-muted-foreground">{t.status} • Due: {t.dueDate || '—'}</div>
                  </div>
                  <div className="text-xs">{t.assignee || 'Unassigned'}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="md:col-span-2">
            <h4 className="text-sm font-semibold border-b pb-2 mb-3">Activity Timeline</h4>
            <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2">
              {activities.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">No activity history yet.</div>}
              {[...activities]
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .map((a, i) => {
                  const normalizedTimestamp = normalizeActivityTimestamp(a.timestamp);
                  const { date, time } = formatActivityDateParts(normalizedTimestamp);
                  return (
                    <div key={a.id || `${i}-${normalizedTimestamp}`} className="bg-muted/10 p-4 rounded-xl border border-muted/40 shadow-sm">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Updated By</div>
                          <div className="font-semibold text-sm">{a.actor || "Unknown"}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground md:text-right">
                          <div className="space-y-1">
                            <div className="uppercase tracking-wide">Date</div>
                            <div>{date}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="uppercase tracking-wide">Time</div>
                            <div>{time}</div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Field Changed</p>
                          <p className="text-sm font-medium">{a.field || a.action}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Activity</p>
                          <p className="text-sm">{a.action}</p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-muted-foreground/10 bg-background p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Old Value</p>
                          <p className="font-mono text-sm text-muted-foreground">{a.oldValue || "—"}</p>
                        </div>
                        <div className="rounded-lg border border-muted-foreground/10 bg-background p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">New Value</p>
                          <p className="font-mono text-sm text-green-700">{a.newValue || "—"}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ClientProfile;
