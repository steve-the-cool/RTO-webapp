import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { subscribeToTasksForRecord } from "@/lib/tasks";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { subscribeToClientPayments, addPayment, type ClientPayment } from "@/lib/payments";
import { formatActivityTime, type ActivityLog, addClientNote } from "@/lib/activity";
import {
  getRecordServiceDetails,
  getRecordServiceAmount,
  serviceLabel,
  type RegistryRecord,
  type ServiceType,
  saveRecord,
  type Bucket,
} from "@/lib/records";
import { StructuredDocumentUploader } from "@/components/StructuredDocumentUploader";
import { InvoiceHistory } from "@/components/InvoiceHistory";
import { InvoiceViewer } from "@/components/InvoiceViewer";
import { WhatsAppMessagePanel } from "@/components/WhatsAppMessagePanel";
import type { Invoice } from "@/lib/billing";
import { toast } from "sonner";

function normalizeActivityTimestamp(timestamp: unknown): string {
  if (!timestamp) return "";
  if (typeof timestamp === "string") return timestamp;
  if (timestamp instanceof Date) return timestamp.toISOString();
  if (
    typeof timestamp === "object" &&
    timestamp !== null &&
    "toDate" in timestamp &&
    typeof (timestamp as any).toDate === "function"
  ) {
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

function formatTimelineText(a: any): string {
  const actor = a.actor || "Unknown User";
  const actionLower = (a.action || "").toLowerCase();

  if (actionLower.includes("created client")) {
    return `${actor} created client`;
  }
  if (actionLower.includes("vehicle added")) {
    return `${actor} added vehicle ${a.newValue || ""}`;
  }
  if (actionLower.includes("vehicle updated")) {
    return `${actor} updated vehicle details (${a.field || ""})`;
  }
  if (actionLower.includes("service added")) {
    return `${actor} added service ${a.newValue || ""}`;
  }
  if (actionLower.includes("service removed")) {
    return `${actor} removed service ${a.oldValue || ""}`;
  }
  if (actionLower.includes("due date changed")) {
    return `${actor} updated ${a.field || "Service"} Due Date`;
  }
  if (actionLower.includes("accounting updated")) {
    return `${actor} updated ${a.field || "Service"} Accounting`;
  }
  if (actionLower.includes("document uploaded")) {
    return `${actor} uploaded ${a.newValue || "document"}`;
  }
  if (actionLower.includes("document removed")) {
    return `${actor} removed ${a.oldValue || "document"}`;
  }
  if (actionLower.includes("updated details") || actionLower.includes("changed")) {
    return `${actor} updated ${a.field || "client details"}`;
  }

  return `${actor} performed: ${a.action}`;
}

interface Props {
  record: RegistryRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceType?: ServiceType;
  bucket?: Bucket;
}

export function ClientProfile({
  record,
  open,
  onOpenChange,
  serviceType,
  bucket = "clients",
}: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [payments, setPayments] = useState<ClientPayment[]>([]);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    serviceId: "",
    amount: "",
    transactionDate: "",
    paymentMode: "UPI",
    accountName: "",
    receivedBy: "",
    referenceNumber: "",
    remarks: "",
  });
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedService, setSelectedService] = useState<any | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("activity");
  const session = getSession();
  const actor = session?.username || "system";
  const actorName = session?.name || session?.username || "System";

  const services = useMemo(() => record?.services ?? [], [record]);
  const serviceDetails = useMemo(() => (record ? getRecordServiceDetails(record) : []), [record]);
  const totalServiceAmount = useMemo(() => (record ? getRecordServiceAmount(record) : 0), [record]);
  const totalReceived = useMemo(() => payments.reduce((s, p) => s + p.amount, 0), [payments]);
  const totalPending = useMemo(
    () => Math.max(0, totalServiceAmount - totalReceived),
    [totalServiceAmount, totalReceived],
  );
  const nextDueService = useMemo(() => {
    const servicesWithDue = serviceDetails
      .filter((service) => service.dueDate)
      .map((service) => ({
        ...service,
        due: new Date(service.dueDate),
      }))
      .filter((service) => !Number.isNaN(service.due.getTime()));
    return servicesWithDue.sort((a, b) => a.due.getTime() - b.due.getTime())[0];
  }, [serviceDetails]);
  const nextDueDays = useMemo(() => {
    if (!nextDueService) return null;
    const now = new Date();
    const due = new Date(nextDueService.dueDate);
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }, [nextDueService]);
  const recordStatus = record?.status ?? "Pending";
  const workflowStages = useMemo(() => {
    const isCompleted = recordStatus === "Completed";
    const paymentSettled = totalServiceAmount > 0 ? totalPending === 0 : false;
    return [
      {
        id: "intake",
        title: "Intake",
        description: "Confirm client details and service scope.",
        status: recordStatus !== "Pending" ? "complete" : "active",
      },
      {
        id: "execution",
        title: "Execution",
        description: "Process the service and updates.",
        status:
          recordStatus === "In Progress"
            ? "active"
            : recordStatus === "Completed"
              ? "complete"
              : "pending",
      },
      {
        id: "billing",
        title: "Billing",
        description: "Collect payment and reconcile accounts.",
        status: paymentSettled ? "complete" : recordStatus === "Completed" ? "active" : "pending",
      },
      {
        id: "closure",
        title: "Closure",
        description: "Close the service with documentation.",
        status: isCompleted ? "complete" : "pending",
      },
    ];
  }, [recordStatus, totalPending, totalServiceAmount]);

  const noteEntries = useMemo(
    () => activities.filter((activity) => activity.action?.toLowerCase().includes("note")),
    [activities],
  );

  const saveNote = async () => {
    if (!record) return;
    setNoteError(null);
    if (!noteDraft.trim()) {
      setNoteError("Please enter a note before saving.");
      return;
    }

    setSavingNote(true);
    try {
      await addClientNote(record.id, actor, actorName, noteDraft);
      setNoteDraft("");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setNoteError(`Save failed: ${message}`);
    } finally {
      setSavingNote(false);
    }
  };

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
              actor: it.performedBy || it.userName || it.userId || "Unknown",
              action: it.action ?? "",
              field: it.fieldName || it.field || "",
              oldValue: it.oldValue || "",
              newValue: it.newValue || "",
              timestamp: normalizeActivityTimestamp(it.performedAt || it.timestamp),
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

  if (serviceType) {
    const matchingService = serviceDetails.find((s) => s.serviceType === serviceType);
    const servicePrice = matchingService?.price ?? 0;
    const serviceReceived = matchingService?.amountReceived ?? 0;
    const servicePending = Math.max(0, servicePrice - serviceReceived);
    const serviceStatus = matchingService?.status || "Pending";
    const serviceDueDate = matchingService?.dueDate;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {serviceLabel(serviceType)} Detail — {record.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 p-4">
            {/* Client & Vehicle Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="space-y-3">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">
                  Client Info
                </h4>
                <div className="text-sm space-y-2">
                  <div>
                    <strong className="text-muted-foreground">Full Name:</strong>{" "}
                    <span className="font-medium">{record.name}</span>
                  </div>
                  <div>
                    <strong className="text-muted-foreground">Mobile Number:</strong>{" "}
                    <span className="font-mono">{record.mo}</span>
                  </div>
                  <div>
                    <strong className="text-muted-foreground">Group / Company:</strong>{" "}
                    <span>{record.groupName || "—"}</span>
                  </div>
                  <div>
                    <strong className="text-muted-foreground">C/O Address:</strong>{" "}
                    <span>{record.co || "—"}</span>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">
                  Vehicle Info
                </h4>
                <div className="text-sm space-y-2">
                  <div>
                    <strong className="text-muted-foreground">Vehicle Number:</strong>{" "}
                    <span className="font-mono font-medium">{record.mvNo || "—"}</span>
                  </div>
                  <div>
                    <strong className="text-muted-foreground">Chassis Number:</strong>{" "}
                    <span className="font-mono">{record.chassisNo || "—"}</span>
                  </div>
                  <div>
                    <strong className="text-muted-foreground">Engine Number:</strong>{" "}
                    <span className="font-mono">{record.engineNo || "—"}</span>
                  </div>
                </div>
              </section>
            </div>

            {/* Service Details & Accounting */}
            <section className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">
                {serviceType} Service Details
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 border rounded-xl bg-card shadow-sm">
                  <div className="text-xs text-muted-foreground uppercase font-medium">
                    Service Amount
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    ₹{servicePrice.toLocaleString("en-IN")}
                  </div>
                </div>
                <div className="p-4 border rounded-xl bg-card shadow-sm">
                  <div className="text-xs text-muted-foreground uppercase font-medium">
                    Received Amount
                  </div>
                  <div className="text-2xl font-bold text-green-600 mt-1">
                    ₹{serviceReceived.toLocaleString("en-IN")}
                  </div>
                </div>
                <div className="p-4 border rounded-xl bg-card shadow-sm">
                  <div className="text-xs text-muted-foreground uppercase font-medium">
                    Pending Amount
                  </div>
                  <div className="text-2xl font-bold text-red-600 mt-1">
                    ₹{servicePending.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm bg-muted/10 p-4 rounded-xl border border-muted/30">
                <div className="space-y-2">
                  <div>
                    <strong className="text-muted-foreground">Status:</strong>{" "}
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ml-2 font-semibold ${
                        serviceStatus === "Completed"
                          ? "bg-green-500/15 text-green-700 border-green-500/30"
                          : serviceStatus === "In Progress" || serviceStatus === "Active"
                            ? "bg-blue-500/15 text-blue-700 border-blue-500/30"
                            : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {serviceStatus}
                    </span>
                  </div>
                  <div>
                    <strong className="text-muted-foreground">Due Date:</strong>{" "}
                    <span className="ml-2">
                      {serviceDueDate ? new Date(serviceDueDate).toLocaleDateString("en-IN") : "—"}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <strong className="text-muted-foreground">Created Date:</strong>{" "}
                    <span className="ml-2">
                      {record.createdAt
                        ? new Date(record.createdAt).toLocaleDateString("en-IN")
                        : record.date || "—"}
                    </span>
                  </div>
                  <div>
                    <strong className="text-muted-foreground">Last Updated:</strong>{" "}
                    <span className="ml-2">
                      {record.lastUpdatedAt
                        ? new Date(record.lastUpdatedAt).toLocaleString("en-IN")
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Documents section specific to this service type */}
            <section className="space-y-3 pt-4 border-t">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">
                Documents
              </h4>
              <StructuredDocumentUploader
                customerId={record.id}
                services={serviceDetails}
                application={record.application}
                work={record.work}
              />
            </section>
          </div>

          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Client Profile — {record.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-4">
          <div className="rounded-2xl border bg-background p-4 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Workflow Status
                </p>
                <h3 className="text-xl font-semibold">Service Workspace</h3>
                <p className="text-sm text-muted-foreground">
                  Track the service stage, follow-ups, documents, and billing in one place.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <WhatsAppMessagePanel mobile={record.mo} name={record.name} />
                <Button size="sm" onClick={() => setShowAddPayment(true)}>
                  Add Payment
                </Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
              {workflowStages.map((stage) => (
                <div key={stage.id} className="rounded-2xl border p-3 bg-muted/5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      {stage.title}
                    </p>
                    <span
                      className={`text-[11px] font-semibold rounded-full px-2 py-1 ${
                        stage.status === "complete"
                          ? "bg-emerald-100 text-emerald-700"
                          : stage.status === "active"
                            ? "bg-sky-100 text-sky-700"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {stage.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{stage.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section>
              <h4 className="text-sm font-semibold border-b pb-1">Client & Vehicle Details</h4>
              <div className="mt-2 text-sm space-y-1">
                <div>
                  <strong>Full Name:</strong> {record.name}
                </div>
                <div>
                  <strong>Mobile Number:</strong> {record.mo}
                </div>
                <div>
                  <strong>Email:</strong> {record.groupName || "—"}
                </div>
                <div>
                  <strong>Address:</strong> {record.co || "—"}
                </div>
                <div>
                  <strong>Vehicle Number:</strong> {record.mvNo || "—"}
                </div>
                <div>
                  <strong>Chassis Number:</strong> {record.chassisNo || "—"}
                </div>
                <div>
                  <strong>Engine Number:</strong> {record.engineNo || "—"}
                </div>
                <div>
                  <strong>Created At:</strong> {record.date}
                </div>
                <div>
                  <strong>Created By:</strong> {record.lastUpdatedBy || "—"}
                </div>
              </div>
            </section>

            <section className="md:col-span-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold border-b pb-1">Accounting</h4>
                <div>
                  <Button size="sm" onClick={() => setShowAddPayment(true)}>
                    Add Payment
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 border rounded">
                  <div className="text-xs text-muted-foreground">Total Amount</div>
                  <div className="text-xl font-bold">
                    ₹{totalServiceAmount.toLocaleString("en-IN")}
                  </div>
                </div>
                <div className="p-3 border rounded">
                  <div className="text-xs text-muted-foreground">Amount Received</div>
                  <div className="text-xl font-bold">₹{totalReceived.toLocaleString("en-IN")}</div>
                </div>
                <div className="p-3 border rounded">
                  <div className="text-xs text-muted-foreground">Pending Amount</div>
                  <div className="text-xl font-bold">₹{totalPending.toLocaleString("en-IN")}</div>
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
                          <td className="py-2">
                            {p.transactionDate
                              ? new Date(p.transactionDate).toLocaleDateString("en-IN")
                              : "—"}
                          </td>
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
                          <td
                            colSpan={8}
                            className="py-4 text-center text-xs text-muted-foreground"
                          >
                            No payments yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>

          <section>
            <h4 className="text-sm font-semibold border-b pb-1">Service Information</h4>
            <div className="mt-2 space-y-2">
              {serviceDetails.map((service, index) => (
                <div
                  key={index}
                  onClick={() => {
                    console.debug("ClientProfile: open service", service);
                    setSelectedService(service);
                  }}
                  className="text-sm border p-3 rounded bg-muted/10 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-center cursor-pointer hover:bg-muted/20 transition-colors"
                >
                  <div>
                    <span className="font-semibold">{serviceLabel(service.serviceType)}</span>
                    <span className="text-xs text-muted-foreground ml-2">({service.status})</span>
                    <div className="text-xs text-muted-foreground">
                      Due:{" "}
                      {service.dueDate
                        ? new Date(service.dueDate).toLocaleDateString("en-IN")
                        : "—"}
                    </div>
                  </div>
                  <div className="text-xs font-mono text-right">
                    Price: ₹{(service.price || 0).toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
              {serviceDetails.length === 0 && (
                <div className="text-xs text-muted-foreground">
                  No service information available
                </div>
              )}
            </div>
          </section>

          <section className="md:col-span-2">
            <h4 className="text-sm font-semibold border-b pb-1">Invoice History</h4>
            <div className="mt-2">
              <InvoiceHistory clientId={record.id} onViewInvoice={setSelectedInvoice} />
            </div>
          </section>

          <section className="md:col-span-2">
            <h4 className="text-sm font-semibold border-b pb-1">Documents</h4>
            <div className="mt-2">
              <StructuredDocumentUploader
                customerId={record.id}
                services={serviceDetails}
                application={record.application}
                work={record.work}
              />
            </div>
          </section>

          <section className="md:col-span-2">
            <h4 className="text-sm font-semibold border-b pb-1">Active Tasks</h4>
            <div className="mt-2 space-y-2">
              {tasks.length === 0 && (
                <div className="text-xs text-muted-foreground">No active tasks.</div>
              )}
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between border p-2 rounded text-sm"
                >
                  <div>
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.status} • Due: {t.dueDate || "—"}
                    </div>
                  </div>
                  <div className="text-xs">{t.assignee || "Unassigned"}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="md:col-span-2">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value)}>
              <TabsList className="grid w-full max-w-xs grid-cols-2">
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="activity" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold border-b pb-2 mb-3">Activity Timeline</h4>
                  <div className="text-xs text-muted-foreground">{activities.length} entries</div>
                </div>
                <div className="space-y-6 max-h-[360px] overflow-y-auto pr-2 pt-2">
                  {activities.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      No activity history yet.
                    </div>
                  )}
                  <div className="relative border-l border-muted pl-4 ml-2 space-y-6">
                    {[...activities]
                      .sort(
                        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
                      )
                      .map((a, i) => {
                        const normalizedTimestamp = normalizeActivityTimestamp(a.timestamp);
                        const { date, time } = formatActivityDateParts(normalizedTimestamp);
                        const timelineText = formatTimelineText(a);

                        return (
                          <div key={a.id || `${i}-${normalizedTimestamp}`} className="relative">
                            {/* Dot indicator */}
                            <div className="absolute -left-[21px] top-1.5 size-3 rounded-full bg-sky-500 border-2 border-background ring-4 ring-sky-50" />

                            <div className="space-y-1">
                              <div className="text-xs text-muted-foreground font-semibold">
                                {date} - {time}
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {timelineText}
                              </p>
                              {a.field && (
                                <div className="mt-2 text-xs grid grid-cols-2 gap-3 max-w-md bg-muted/20 p-2 rounded-lg border border-muted-foreground/10">
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground">
                                      Old Value
                                    </span>
                                    <div className="font-mono text-muted-foreground truncate">
                                      {a.oldValue || "—"}
                                    </div>
                                  </div>
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground">
                                      New Value
                                    </span>
                                    <div className="font-mono text-emerald-600 font-semibold truncate">
                                      {a.newValue || "—"}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="notes" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold border-b pb-2 mb-3">Client Notes</h4>
                  <div className="text-xs text-muted-foreground">
                    {noteEntries.length} note entries
                  </div>
                </div>
                <div className="space-y-3">
                  <Textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Write a note for this client"
                    className="min-h-[120px]"
                  />
                  {noteError && <div className="text-xs text-red-600">{noteError}</div>}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setNoteDraft("")}
                      disabled={savingNote}
                    >
                      Clear
                    </Button>
                    <Button onClick={saveNote} disabled={savingNote}>
                      {savingNote ? "Saving…" : "Save Note"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {noteEntries.length === 0 && (
                    <div className="text-xs text-muted-foreground">No notes yet.</div>
                  )}
                  {noteEntries.map((note) => {
                    const normalizedTimestamp = normalizeActivityTimestamp(note.timestamp);
                    const { date, time } = formatActivityDateParts(normalizedTimestamp);
                    return (
                      <div key={note.id} className="rounded-2xl border p-4 bg-muted/10">
                        <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
                          <span>{note.actor || "Unknown"}</span>
                          <span>
                            {date} {time}
                          </span>
                        </div>
                        <p className="mt-2 text-sm">{note.newValue || note.action}</p>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          </section>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>

        {/* Invoice Viewer Modal */}
        {selectedInvoice && (
          <InvoiceViewer invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
        )}

        {/* Service Detail Modal */}
        {selectedService && (
          <Dialog
            open={!!selectedService}
            onOpenChange={(open) => {
              if (!open) setSelectedService(null);
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {serviceLabel(selectedService.serviceType)} — {record.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Service Status Overview */}
                <div className="rounded-lg border p-4 bg-muted/5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      Service Status
                    </span>
                    <span
                      className={`text-xs font-bold rounded-full px-3 py-1 ${
                        selectedService.status === "Completed"
                          ? "bg-emerald-100 text-emerald-700"
                          : selectedService.status === "In Progress"
                            ? "bg-sky-100 text-sky-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {selectedService.status}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Price:</span>
                      <span className="font-semibold">
                        ₹{(selectedService.price || 0).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Due Date:</span>
                      <span className="font-semibold">
                        {selectedService.dueDate
                          ? new Date(selectedService.dueDate).toLocaleDateString("en-IN")
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Workflow Progress */}
                <div className="space-y-3">
                  <h5 className="text-sm font-semibold">Workflow Progress</h5>
                  <div className="space-y-2">
                    {[
                      {
                        stage: "Intake",
                        active: selectedService.status !== "Pending",
                        completed: selectedService.status !== "Pending",
                      },
                      {
                        stage: "Execution",
                        active: selectedService.status === "In Progress",
                        completed:
                          selectedService.status === "Completed" ||
                          selectedService.status === "In Progress",
                      },
                      {
                        stage: "Completion",
                        active: false,
                        completed: selectedService.status === "Completed",
                      },
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div
                          className={`h-3 w-3 rounded-full ${item.completed ? "bg-emerald-500" : item.active ? "bg-sky-500" : "bg-muted"}`}
                        />
                        <span className="text-xs font-medium">{item.stage}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Amount Summary */}
                <div className="grid grid-cols-3 gap-2 text-center p-3 rounded border bg-muted/5">
                  <div>
                    <div className="text-[10px] text-muted-foreground">Amount</div>
                    <div className="text-sm font-semibold">
                      ₹{(selectedService.price || 0).toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="border-l border-r">
                    <div className="text-[10px] text-muted-foreground">Paid</div>
                    <div className="text-sm font-semibold text-green-600">
                      ₹{(selectedService.amountReceived || 0).toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Pending</div>
                    <div className="text-sm font-semibold text-red-600">
                      ₹
                      {Math.max(
                        0,
                        (selectedService.price || 0) - (selectedService.amountReceived || 0),
                      ).toLocaleString("en-IN")}
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setSelectedService(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Add Payment Modal */}
        <Dialog open={showAddPayment} onOpenChange={setShowAddPayment}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Payment — {record.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Service</label>
                <Select
                  value={paymentForm.serviceId}
                  onValueChange={(v) => setPaymentForm({ ...paymentForm, serviceId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {serviceLabel(s.serviceType)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Amount</label>
                <Input
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  placeholder="Enter amount"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Transaction Date</label>
                <Input
                  type="date"
                  value={paymentForm.transactionDate}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, transactionDate: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium">Payment Mode</label>
                <Select
                  value={paymentForm.paymentMode}
                  onValueChange={(v) => setPaymentForm({ ...paymentForm, paymentMode: v })}
                >
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
                <Input
                  value={paymentForm.accountName}
                  onChange={(e) => setPaymentForm({ ...paymentForm, accountName: e.target.value })}
                  placeholder="Account name"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Received By</label>
                <Input
                  value={paymentForm.receivedBy}
                  onChange={(e) => setPaymentForm({ ...paymentForm, receivedBy: e.target.value })}
                  placeholder="Received by"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Reference / Txn ID</label>
                <Input
                  value={paymentForm.referenceNumber}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })
                  }
                  placeholder="Reference number"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Remarks</label>
                <Textarea
                  value={paymentForm.remarks}
                  onChange={(e) => setPaymentForm({ ...paymentForm, remarks: e.target.value })}
                  placeholder="Optional notes"
                />
              </div>

              {paymentError && <div className="text-xs text-red-600">{paymentError}</div>}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="secondary"
                onClick={() => setShowAddPayment(false)}
                disabled={savingPayment}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  setPaymentError(null);
                  const amt = Number(paymentForm.amount || 0);
                  if (!paymentForm.serviceId) {
                    setPaymentError("Please select a service");
                    return;
                  }
                  if (!amt || amt <= 0) {
                    setPaymentError("Please enter a valid amount");
                    return;
                  }
                  setSavingPayment(true);
                  try {
                    const saved = await addPayment({
                      clientId: record.id,
                      serviceId: paymentForm.serviceId,
                      amount: amt,
                      transactionDate: paymentForm.transactionDate
                        ? new Date(paymentForm.transactionDate).toISOString()
                        : new Date().toISOString(),
                      paymentMode: paymentForm.paymentMode as any,
                      accountName: paymentForm.accountName || "",
                      receivedBy: paymentForm.receivedBy || "",
                      referenceNumber: paymentForm.referenceNumber || "",
                      remarks: paymentForm.remarks || "",
                    });

                    // Update the amountReceived for the selected service on the record
                    const updatedServices = serviceDetails.map((s) => {
                      if (s.serviceType === paymentForm.serviceId) {
                        return {
                          ...s,
                          amountReceived: (s.amountReceived || 0) + amt,
                        };
                      }
                      return s;
                    });

                    const updatedRecord = {
                      ...record,
                      services: updatedServices,
                    };

                    await saveRecord(bucket, updatedRecord, actor);

                    // Optimistically update UI
                    setPayments((prev) => {
                      if (!saved || !saved.id) return prev;
                      return [saved as ClientPayment, ...prev];
                    });
                    setShowAddPayment(false);
                    setPaymentForm({
                      serviceId: "",
                      amount: "",
                      transactionDate: "",
                      paymentMode: "UPI",
                      accountName: "",
                      receivedBy: "",
                      referenceNumber: "",
                      remarks: "",
                    });
                    toast.success("Payment recorded successfully!");
                  } catch (err) {
                    console.error("Failed to save payment", err);
                    setPaymentError("Failed to save payment. Try again.");
                    toast.error(
                      `Failed to save payment: ${err instanceof Error ? err.message : String(err)}`,
                    );
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
