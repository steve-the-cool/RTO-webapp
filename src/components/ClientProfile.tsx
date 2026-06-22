import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { subscribeToTasksForRecord } from "@/lib/tasks";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { subscribeToClientPayments, addPayment, type ClientPayment } from "@/lib/payments";
import { formatActivityTime, type ActivityLog } from "@/lib/activity";
import { getRecordServiceDetails, serviceLabel, type RegistryRecord } from "@/lib/records";
import { StructuredDocumentUploader } from "@/components/StructuredDocumentUploader";
import { InvoiceHistory } from "@/components/InvoiceHistory";
import { InvoiceViewer } from "@/components/InvoiceViewer";
import type { Invoice } from "@/lib/billing";

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
  const [tasks, setTasks] = useState<any[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [payments, setPayments] = useState<ClientPayment[]>([]);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: "", transactionDate: "", paymentMode: "UPI", accountName: "", receivedBy: "", referenceNumber: "", remarks: "" });
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  useEffect(() => {
    if (!record) return;
    const unsubTasks = subscribeToTasksForRecord(record.id, setTasks);

    const fallbackActivities = (record.activityLogs ?? []).map((log) => ({
      ...log,
      timestamp: normalizeActivityTimestamp(log.timestamp),
    }));
    setActivities(fallbackActivities);

    // Subscribe to client_activity_logs collection
    const q = query(collection(db, "client_activity_logs"), where("clientId", "==", record.id));
    const unsubActs = onSnapshot(
      q,
      (snap) => {
        const remoteActivities = snap.docs
          .map((d) => {
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
          })
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        if (remoteActivities.length === 0 && fallbackActivities.length > 0) {
          setActivities(fallbackActivities);
        } else {
          setActivities(remoteActivities);
        }
      },
      (err) => {
        console.error("[ClientProfile] Failed to load activity history:", err);
        if (fallbackActivities.length > 0) {
          setActivities(fallbackActivities);
        }
      },
    );

    // Subscribe to client payments
    const unsubPayments = subscribeToClientPayments(record.id, (items) => setPayments(items));

    return () => {
      unsubTasks();
      unsubActs();
      unsubPayments();
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

          <section className="md:col-span-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold border-b pb-1">Accounting</h4>
              <div>
                <Button size="sm" onClick={() => setShowAddPayment(true)}>Add Payment</Button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 border rounded">
                <div className="text-xs text-muted-foreground">Total Amount</div>
                <div className="text-xl font-bold">₹{( (record.serviceAmount || 0) ).toLocaleString("en-IN")}</div>
              </div>
              <div className="p-3 border rounded">
                <div className="text-xs text-muted-foreground">Amount Received</div>
                <div className="text-xl font-bold">₹{payments.reduce((s, p) => s + p.amount, 0).toLocaleString("en-IN")}</div>
              </div>
              <div className="p-3 border rounded">
                <div className="text-xs text-muted-foreground">Pending Amount</div>
                <div className="text-xl font-bold">₹{Math.max(0, (record.serviceAmount || 0) - payments.reduce((s, p) => s + p.amount, 0)).toLocaleString("en-IN")}</div>
              </div>
            </div>

            <div className="mt-4">
              <h5 className="text-sm font-medium">Payment History</h5>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2">Date</th>
                      <th>Amount</th>
                      <th>Mode</th>
                      <th>Received In</th>
                      <th>Received By</th>
                      <th>Reference</th>
                      <th>Remarks</th>
                      <th>Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="py-2">{p.transactionDate ? new Date(p.transactionDate).toLocaleDateString("en-IN") : "—"}</td>
                        <td>₹{p.amount.toLocaleString("en-IN")}</td>
                        <td>{p.paymentMode}</td>
                        <td>{p.accountName}</td>
                        <td>{p.receivedBy}</td>
                        <td>{p.referenceNumber || "—"}</td>
                        <td>{p.remarks || "—"}</td>
                        <td>{p.createdAt ? new Date(p.createdAt).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                    {payments.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-4 text-center text-xs text-muted-foreground">No payments yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
            <h4 className="text-sm font-semibold border-b pb-1">Invoice History</h4>
            <div className="mt-2">
              <InvoiceHistory
                clientId={record.id}
                onViewInvoice={setSelectedInvoice}
              />
            </div>
          </section>

          <section className="md:col-span-2">
            <h4 className="text-sm font-semibold border-b pb-1">Documents</h4>
            <div className="mt-2">
              <StructuredDocumentUploader
                customerId={record.id}
                services={getRecordServiceDetails(record)}
                application={record.application}
                work={record.work}
              />
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

        {/* Invoice Viewer Modal */}
        {selectedInvoice && (
          <InvoiceViewer
            invoice={selectedInvoice}
            onClose={() => setSelectedInvoice(null)}
          />
        )}

        {/* Add Payment Modal */}
        <Dialog open={showAddPayment} onOpenChange={setShowAddPayment}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Payment — {record.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Amount</label>
                <Input
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  placeholder="Enter amount"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-sm font-medium">Transaction Date</label>
                <Input
                  type="date"
                  value={paymentForm.transactionDate}
                  onChange={(e) => setPaymentForm({ ...paymentForm, transactionDate: e.target.value })}
                />
              </div>

              <div>
                <label className="text-sm font-medium">Payment Mode</label>
                <Select value={paymentForm.paymentMode} onValueChange={(v) => setPaymentForm({ ...paymentForm, paymentMode: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                    <SelectItem value="Online Payment">Online Payment</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Received In (Account)</label>
                <Input value={paymentForm.accountName} onChange={(e) => setPaymentForm({ ...paymentForm, accountName: e.target.value })} placeholder="Account name" />
              </div>

              <div>
                <label className="text-sm font-medium">Received By</label>
                <Input value={paymentForm.receivedBy} onChange={(e) => setPaymentForm({ ...paymentForm, receivedBy: e.target.value })} placeholder="Received by" />
              </div>

              <div>
                <label className="text-sm font-medium">Reference / Txn ID</label>
                <Input value={paymentForm.referenceNumber} onChange={(e) => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })} placeholder="Reference number" />
              </div>

              <div>
                <label className="text-sm font-medium">Remarks</label>
                <Textarea value={paymentForm.remarks} onChange={(e) => setPaymentForm({ ...paymentForm, remarks: e.target.value })} placeholder="Optional notes" />
              </div>

              {paymentError && <div className="text-xs text-red-600">{paymentError}</div>}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" onClick={() => setShowAddPayment(false)} disabled={savingPayment}>Cancel</Button>
              <Button
                onClick={async () => {
                  setPaymentError(null);
                  const amt = Number(paymentForm.amount || 0);
                  if (!amt || amt <= 0) {
                    setPaymentError("Please enter a valid amount");
                    return;
                  }
                  setSavingPayment(true);
                  try {
                    await addPayment({
                      clientId: record.id,
                      amount: amt,
                      transactionDate: paymentForm.transactionDate ? new Date(paymentForm.transactionDate).toISOString() : new Date().toISOString(),
                      paymentMode: paymentForm.paymentMode as any,
                      accountName: paymentForm.accountName || "",
                      receivedBy: paymentForm.receivedBy || "",
                      referenceNumber: paymentForm.referenceNumber || "",
                      remarks: paymentForm.remarks || "",
                    });
                    setShowAddPayment(false);
                    setPaymentForm({ amount: "", transactionDate: "", paymentMode: "UPI", accountName: "", receivedBy: "", referenceNumber: "", remarks: "" });
                  } catch (err) {
                    console.error("Failed to save payment", err);
                    setPaymentError("Failed to save payment. Try again.");
                  } finally {
                    setSavingPayment(false);
                  }
                }}
                disabled={savingPayment}
              >
                {savingPayment ? "Saving…" : "Save Payment"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

      </DialogContent>
    </Dialog>
  );
}

export default ClientProfile;
