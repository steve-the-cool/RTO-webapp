import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { subscribeToDocsFor, type CustomerDoc } from "@/lib/customerDocs";
import { subscribeToTasksForRecord } from "@/lib/tasks";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { formatActivityTime, type ActivityLog } from "@/lib/activity";
import { getRecordServices, type RegistryRecord } from "@/lib/records";

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
      const items = snap.docs.map((d) => d.data() as any);
      setActivities(items.map((it: any) => ({
        id: it.id ?? "",
        actor: it.userName ?? it.userId ?? "",
        action: it.action,
        field: it.field,
        oldValue: it.oldValue,
        newValue: it.newValue,
        timestamp: it.timestamp,
      })));
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
            <h4 className="text-sm font-semibold">Client Information</h4>
            <div className="mt-2 text-sm space-y-1">
              <div><strong>Full Name:</strong> {record.name}</div>
              <div><strong>Mobile Number:</strong> {record.mo}</div>
              <div><strong>Email:</strong> {record.groupName || "—"}</div>
              <div><strong>Address:</strong> {record.co || "—"}</div>
              <div><strong>Created At:</strong> {record.date}</div>
              <div><strong>Created By:</strong> {record.lastUpdatedBy || "—"}</div>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold">Service Information</h4>
            <div className="mt-2 text-sm space-y-1">
              <div><strong>Services:</strong> {getRecordServices(record).join(", ") || "—"}</div>
              <div><strong>Service Status:</strong> {record.serviceStatus || "—"}</div>
              <div><strong>Service Start:</strong> {record.date || "—"}</div>
              <div><strong>Expiry / Due:</strong> {record.serviceDueDate || "—"}</div>
            </div>
          </section>

          <section className="md:col-span-2">
            <h4 className="text-sm font-semibold">Documents</h4>
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
            <h4 className="text-sm font-semibold">Active Tasks</h4>
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
            <h4 className="text-sm font-semibold">Activity History</h4>
            <div className="mt-2 space-y-2 text-sm">
              {activities.length === 0 && <div className="text-xs text-muted-foreground">No activity yet.</div>}
              {activities.map((a, i) => (
                <div key={i} className="border p-2 rounded">
                  <div className="text-xs text-muted-foreground">{a.actor} • {new Date(a.timestamp).toLocaleString()}</div>
                  <div className="mt-1"><strong>{a.action}</strong></div>
                  {a.field && (
                    <div className="text-xs mt-1">
                      <div>Field: {a.field}</div>
                      <div>Old: {a.oldValue}</div>
                      <div>New: {a.newValue}</div>
                    </div>
                  )}
                </div>
              ))}
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
