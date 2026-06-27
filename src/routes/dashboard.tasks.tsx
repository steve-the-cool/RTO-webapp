import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Trash2,
  Plus,
  Link2,
  Search,
  Pencil,
  CheckCircle2,
  Eye,
  Paperclip,
  Send,
  MessageSquare,
  Car,
  Calendar as CalIcon,
  Clock,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Users,
  Download,
  Printer,
  GripVertical,
  CheckCircle,
} from "lucide-react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { collection, onSnapshot } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { getSession } from "@/lib/auth";
import {
  STAFF_USERS,
  staffLabel,
  subscribeToRecords,
  type Bucket,
  type RegistryRecord,
} from "@/lib/records";
import {
  subscribeToTasks,
  createManualTask,
  setTaskDone,
  softDeleteTask,
  updateTask,
  addComment,
  addAttachment,
  toggleSubtask,
  addSubtask,
  reassignTask,
  markTaskAsRead,
  removeTask,
  updateSubtasks,
  PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  subscribeToTemplates,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type AssociationType,
  type TaskAttachment,
  type TaskTemplate,
  type TaskSubtask,
} from "@/lib/tasks";
import { generateTaskPDF, printWindow } from "@/lib/pdfGenerator";
import { cn } from "@/lib/utils";
import { DeleteTaskDialog } from "@/components/DeleteTaskDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/tasks")({ component: TasksPage });

type SortMode = "latest" | "oldest" | "priority" | "due";

const PRIORITY_RANK: Record<TaskPriority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

const SERVICE_TEMPLATES: Record<string, string[]> = {
  Insurance: [
    "Call Client",
    "Collect RC",
    "Collect Insurance Copy",
    "Receive Payment",
    "Submit Application",
    "Deliver Documents",
  ],
  Fitness: [
    "Inspect Vehicle",
    "Collect Fees",
    "Submit Application",
    "Fitness Test Booking",
    "Obtain Certificate",
  ],
  Tax: [
    "Calculate Tax Due",
    "Collect Documents",
    "Process Payment",
    "Submit Challan",
    "Provide Receipt",
  ],
  PUC: ["Check Emissions", "Collect Payment", "Generate PUC Certificate", "Deliver Copy"],
  "National Permit": [
    "Check Eligibility",
    "Collect Authorization Details",
    "Receive Payment",
    "Apply Online",
    "Print Permit",
  ],
  "Gujarat Permit": [
    "Check State Authorization",
    "Collect Fees",
    "Apply to RTO",
    "Issue Gujarat Permit Document",
  ],
  "License Renewal": [
    "Collect Existing License",
    "Medical Certificate Verification",
    "Submit Renewal Application",
    "Deliver License",
  ],
  "RC Transfer": [
    "Obtain Form 29 & 30",
    "Collect Buyer/Seller IDs",
    "Submit Transfer Application",
    "Deliver Transferred RC",
  ],
  "HP Termination": [
    "Obtain Bank NOC",
    "Collect Form 35",
    "Apply for HP Deletion",
    "Deliver Updated RC",
  ],
};

const PREDEFINED_SERVICES = [
  "Insurance",
  "Fitness",
  "Tax",
  "PUC",
  "National Permit",
  "Gujarat Permit",
  "License Renewal",
  "RC Transfer",
  "HP Termination",
];

const priorityBadgeClass = (p: TaskPriority) =>
  ({
    Urgent: "bg-red-100 text-red-700 border-red-200",
    High: "bg-orange-100 text-orange-700 border-orange-200",
    Medium: "bg-blue-100 text-blue-700 border-blue-200",
    Low: "bg-slate-100 text-slate-600 border-slate-200",
  })[p];

const statusBadgeClass = (s: TaskStatus) =>
  ({
    Assigned: "bg-orange-100 text-orange-700 border-orange-200",
    Read: "bg-cyan-100 text-cyan-700 border-cyan-200",
    "In Progress": "bg-indigo-100 text-indigo-700 border-indigo-200",
    Completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    "On Hold": "bg-zinc-100 text-zinc-700 border-zinc-200",
  })[s];

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function isOverdue(t: Task) {
  return !!t.dueDate && !t.done && new Date(t.dueDate).getTime() < Date.now();
}

function getStatusCounts(tasks: Task[]): Record<TaskStatus, number> {
  const counts: Record<TaskStatus, number> = {
    Assigned: 0,
    Read: 0,
    "In Progress": 0,
    Completed: 0,
    "On Hold": 0,
  };
  for (const task of tasks) {
    if (counts[task.status] !== undefined) {
      counts[task.status]++;
    }
  }
  return counts;
}

function TasksPage() {
  const [session] = useState(() => getSession());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<RegistryRecord[]>([]);
  const [leads, setLeads] = useState<RegistryRecord[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);

  // view and filters
  const [viewTab, setViewTab] = useState<"my" | "all">("my");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [associationFilter, setAssociationFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("latest");

  // dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  // Add Remark Quick Dialog State
  const [remarkTaskId, setRemarkTaskId] = useState<string | null>(null);
  const [quickRemarkText, setQuickRemarkText] = useState("");
  const [savingRemark, setSavingRemark] = useState(false);

  useEffect(() => {
    const u1 = subscribeToTasks(setTasks);
    const u2 = subscribeToRecords("clients", setClients);
    const u3 = subscribeToRecords("leads", setLeads);
    const u4 = onSnapshot(collection(db, "registry_vehicles_v2"), (snap) => {
      setVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, []);

  const isAdmin = session?.role === "admin";
  const canSeeAllTasks = isAdmin;
  const detailsTask = tasks.find((t) => t.id === detailsId) ?? null;

  // Separate task lists for tab counting
  const myTasks = useMemo(() => {
    if (!session) return [];
    return tasks.filter((t) => t.assignee === session.username);
  }, [tasks, session]);

  const allTasks = tasks;

  // Apply filters based on view tab
  const baseList = useMemo(() => {
    if (viewTab === "my") return myTasks;
    if (viewTab === "all" && canSeeAllTasks) return allTasks;
    return [];
  }, [viewTab, myTasks, allTasks, canSeeAllTasks]);

  // Apply all filters to base list
  const visible = useMemo(() => {
    if (!session) return [];
    let list = baseList;

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          staffLabel(t.assignee).toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (priorityFilter !== "all") list = list.filter((t) => t.priority === priorityFilter);
    if (assigneeFilter !== "all") list = list.filter((t) => t.assignee === assigneeFilter);
    if (associationFilter !== "all")
      list = list.filter((t) => t.associationType === associationFilter);

    if (dueFilter !== "all") {
      const now = Date.now();
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const weekEnd = endOfToday.getTime() + 6 * 86400_000;
      list = list.filter((t) => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate).getTime();
        if (dueFilter === "overdue") return d < now && !t.done;
        if (dueFilter === "today") return d <= endOfToday.getTime() && d >= now - 86400_000;
        if (dueFilter === "week") return d <= weekEnd;
        return true;
      });
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "latest") return +new Date(b.createdAt) - +new Date(a.createdAt);
      if (sort === "oldest") return +new Date(a.createdAt) - +new Date(b.createdAt);
      if (sort === "priority") return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (sort === "due") {
        const da = a.dueDate ? +new Date(a.dueDate) : Infinity;
        const db = b.dueDate ? +new Date(b.dueDate) : Infinity;
        return da - db;
      }
      return 0;
    });
    return sorted;
  }, [
    baseList,
    session,
    query,
    statusFilter,
    priorityFilter,
    assigneeFilter,
    associationFilter,
    dueFilter,
    sort,
  ]);

  const stats = useMemo(
    () => ({
      my: myTasks.length,
      all: allTasks.length,
      visible: visible.length,
      pending: visible.filter((t) => !t.done).length,
      overdue: visible.filter(isOverdue).length,
      completed: visible.filter((t) => t.done).length,
      statusCounts: getStatusCounts(visible),
    }),
    [visible, myTasks, allTasks],
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (t: Task) => {
    setEditing(t);
    setFormOpen(true);
  };

  const handleQuickAddRemark = async () => {
    if (!remarkTaskId || !quickRemarkText.trim()) return;
    setSavingRemark(true);
    try {
      await addComment(remarkTaskId, session?.username || "system", quickRemarkText.trim());
      toast.success("Remark added!");
      setQuickRemarkText("");
      setRemarkTaskId(null);
    } catch (err: any) {
      toast.error("Failed to add remark");
    } finally {
      setSavingRemark(false);
    }
  };

  const handleQuickChangeStatus = async (task: Task, s: TaskStatus) => {
    try {
      await updateTask(
        task.id,
        { status: s, done: s === "Completed" },
        session?.username || "system",
        `Status → ${s}`,
      );
      if (s === "Completed") {
        await setTaskDone(task.id, true, session?.username || "system");
      }
      toast.success(`Status updated to ${s}`);
    } catch (err: any) {
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tasks</h2>
          <p className="text-sm text-muted-foreground">
            {stats.visible} shown • {stats.pending} pending • {stats.overdue} overdue •{" "}
            {stats.completed} done
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate}>
            <Plus className="size-4 mr-1" />
            Add task
          </Button>
        )}
      </div>

      {/* Tab Navigation */}
      <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as "my" | "all")}>
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="my">My Tasks ({stats.my})</TabsTrigger>
          <TabsTrigger value="all" disabled={!canSeeAllTasks}>
            All Tasks {canSeeAllTasks && `(${stats.all})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my" className="space-y-3">
          {/* Search + filters */}
          <div className="rounded-xl border bg-card p-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search tasks by title, description, assignee…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  {TASK_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priority</SelectItem>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter} disabled={!isAdmin}>
                <SelectTrigger>
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All staff</SelectItem>
                  {STAFF_USERS.map((s) => (
                    <SelectItem key={s.username} value={s.username}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={associationFilter} onValueChange={setAssociationFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Linked to" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All links</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="none">Standalone</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dueFilter} onValueChange={setDueFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Due date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any due date</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="today">Due today</SelectItem>
                  <SelectItem value="week">Due this week</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">Latest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="priority">Priority (high → low)</SelectItem>
                  <SelectItem value="due">Due date (soonest)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status counts */}
          <div className="rounded-xl border bg-card p-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge className="bg-orange-100 text-orange-700 border-orange-200">
                  {stats.statusCounts["Assigned"]}
                </Badge>
                <span className="text-muted-foreground">Assigned</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200">
                  {stats.statusCounts["Read"]}
                </Badge>
                <span className="text-muted-foreground">Read</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">
                  {stats.statusCounts["In Progress"]}
                </Badge>
                <span className="text-muted-foreground">In Progress</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  {stats.statusCounts["Completed"]}
                </Badge>
                <span className="text-muted-foreground">Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-zinc-100 text-zinc-700 border-zinc-200">
                  {stats.statusCounts["On Hold"]}
                </Badge>
                <span className="text-muted-foreground">On Hold</span>
              </div>
            </div>
          </div>

          {/* Task Grid Table */}
          <TaskTable
            tasks={visible}
            clients={clients}
            leads={leads}
            vehicles={vehicles}
            isAdmin={!!isAdmin}
            onView={(t) => setDetailsId(t.id)}
            onEdit={openEdit}
            onDelete={(t) => {
              setTaskToDelete(t);
              setDeleteOpen(true);
            }}
            onToggleDone={(t, v) => setTaskDone(t.id, v, session?.username ?? "system")}
            onAddRemark={(t) => setRemarkTaskId(t.id)}
            onChangeStatus={handleQuickChangeStatus}
          />
        </TabsContent>

        <TabsContent value="all" className="space-y-3">
          {/* Search + filters */}
          <div className="rounded-xl border bg-card p-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search tasks by title, description, assignee…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  {TASK_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priority</SelectItem>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter} disabled={!isAdmin}>
                <SelectTrigger>
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All staff</SelectItem>
                  {STAFF_USERS.map((s) => (
                    <SelectItem key={s.username} value={s.username}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={associationFilter} onValueChange={setAssociationFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Linked to" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All links</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="none">Standalone</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dueFilter} onValueChange={setDueFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Due date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any due date</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="today">Due today</SelectItem>
                  <SelectItem value="week">Due this week</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">Latest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="priority">Priority (high → low)</SelectItem>
                  <SelectItem value="due">Due date (soonest)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status counts */}
          <div className="rounded-xl border bg-card p-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge className="bg-orange-100 text-orange-700 border-orange-200">
                  {stats.statusCounts["Assigned"]}
                </Badge>
                <span className="text-muted-foreground">Assigned</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200">
                  {stats.statusCounts["Read"]}
                </Badge>
                <span className="text-muted-foreground">Read</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">
                  {stats.statusCounts["In Progress"]}
                </Badge>
                <span className="text-muted-foreground">In Progress</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  {stats.statusCounts["Completed"]}
                </Badge>
                <span className="text-muted-foreground">Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-zinc-100 text-zinc-700 border-zinc-200">
                  {stats.statusCounts["On Hold"]}
                </Badge>
                <span className="text-muted-foreground">On Hold</span>
              </div>
            </div>
          </div>

          {/* Task Grid Table */}
          <TaskTable
            tasks={visible}
            clients={clients}
            leads={leads}
            vehicles={vehicles}
            isAdmin={!!isAdmin}
            onView={(t) => setDetailsId(t.id)}
            onEdit={openEdit}
            onDelete={(t) => {
              setTaskToDelete(t);
              setDeleteOpen(true);
            }}
            onToggleDone={(t, v) => setTaskDone(t.id, v, session?.username ?? "system")}
            onAddRemark={(t) => setRemarkTaskId(t.id)}
            onChangeStatus={handleQuickChangeStatus}
          />
        </TabsContent>
      </Tabs>

      <TaskFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        clients={clients}
        leads={leads}
        vehicles={vehicles}
        actor={session?.username ?? "system"}
        isAdmin={!!isAdmin}
      />

      {detailsTask && (
        <TaskDetailsSheet
          open={!!detailsId}
          onClose={() => setDetailsId(null)}
          task={detailsTask}
          clients={clients}
          leads={leads}
          vehicles={vehicles}
          actor={session?.username ?? "system"}
          isAdmin={!!isAdmin}
          onEdit={openEdit}
        />
      )}

      {taskToDelete && (
        <DeleteTaskDialog
          open={deleteOpen}
          onOpenChange={(v) => {
            if (!v) {
              setDeleteOpen(false);
              setTaskToDelete(null);
            }
          }}
          taskId={taskToDelete.id}
          taskTitle={taskToDelete.title}
          userRole={isAdmin ? "admin" : "staff"}
          username={session?.username ?? "system"}
        />
      )}

      {/* Add Remark Modal */}
      {remarkTaskId && (
        <Dialog open={!!remarkTaskId} onOpenChange={(v) => !v && setRemarkTaskId(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Task Remark</DialogTitle>
              <DialogDescription>
                Record operational updates or comments directly on the task timeline.
              </DialogDescription>
            </DialogHeader>

            <div className="py-2 space-y-2">
              <Label htmlFor="remarkText" className="text-xs uppercase font-bold text-gray-500">
                Remark Text *
              </Label>
              <Textarea
                id="remarkText"
                rows={4}
                required
                placeholder="e.g. Documents collected from client."
                value={quickRemarkText}
                onChange={(e) => setQuickRemarkText(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => setRemarkTaskId(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleQuickAddRemark}
                disabled={savingRemark || !quickRemarkText.trim()}
              >
                {savingRemark ? <Loader2 className="size-4 animate-spin" /> : "Save Remark"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Professional Task Table Component ──────────────────────────────────────
function TaskTable({
  tasks,
  clients,
  leads,
  vehicles,
  isAdmin,
  onView,
  onEdit,
  onDelete,
  onToggleDone,
  onAddRemark,
  onChangeStatus,
}: {
  tasks: Task[];
  clients: RegistryRecord[];
  leads: RegistryRecord[];
  vehicles: any[];
  isAdmin: boolean;
  onView: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  onToggleDone: (t: Task, v: boolean) => void;
  onAddRemark: (t: Task) => void;
  onChangeStatus: (t: Task, s: TaskStatus) => void;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const totalPages = Math.ceil(tasks.length / pageSize);
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return tasks.slice(start, start + pageSize);
  }, [tasks, currentPage]);

  const getTaskInfo = (t: Task) => {
    let clientName = "Standalone";
    if (t.associationType === "client") {
      clientName = clients.find((c) => c.id === t.recordId)?.name || "Unknown Client";
    } else if (t.associationType === "lead") {
      clientName = leads.find((l) => l.id === t.recordId)?.name || "Unknown Lead";
    }

    let taskName = t.title || "General Follow Up";
    let service = t.serviceName || "";

    if (
      taskName.startsWith("Client:") ||
      taskName.startsWith("Lead:") ||
      taskName.startsWith("Customer:")
    ) {
      const parts = taskName.split("—");
      if (parts.length > 1) {
        const extracted = parts[parts.length - 1].trim();
        taskName = extracted;
        if (!service) {
          service = extracted;
        }
      } else {
        taskName = "General Follow Up";
      }
    }

    if (!service) {
      service = t.description || "Follow Up";
    }

    // Resolve vehicle details if linked
    let vehicleNum = "";
    if (t.vehicleId) {
      const found = vehicles.find((v) => v.id === t.vehicleId);
      if (found) {
        vehicleNum = found.vehicleNumber || "";
      }
    }

    return { taskName, clientName, service, vehicleNum };
  };

  const getSubtasksProgress = (t: Task) => {
    const list = t.subtasks ?? [];
    if (list.length === 0) return null;
    const completed = list.filter((s) => s.completed).length;
    const pct = Math.round((completed / list.length) * 100);
    return `${completed} / ${list.length} (${pct}%)`;
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-xl bg-white overflow-hidden shadow-sm">
        <div className="max-h-[60vh] overflow-y-auto relative">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-50 text-gray-500 uppercase font-bold text-[9px] border-b z-10">
              <tr>
                <th className="p-3">Task Name</th>
                <th className="p-3">Client Name</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3">Service</th>
                <th className="p-3">Assigned Employee</th>
                <th className="p-3">Priority</th>
                <th className="p-3">Due Date</th>
                <th className="p-3">Status</th>
                <th className="p-3">Progress</th>
                <th className="p-3">Last Remark</th>
                <th className="p-3">Last Updated By</th>
                <th className="p-3">Last Updated On</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-gray-700 font-medium">
              {paginatedTasks.map((t) => {
                const info = getTaskInfo(t);
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td
                      className="p-3 font-semibold text-gray-900 max-w-[150px] truncate"
                      title={info.taskName}
                    >
                      {info.taskName}
                    </td>
                    <td
                      className="p-3 max-w-[120px] truncate text-primary font-bold"
                      title={info.clientName}
                    >
                      {info.clientName}
                    </td>
                    <td className="p-3 font-mono text-[11px] text-gray-600">
                      {info.vehicleNum ? (
                        <span className="flex items-center gap-1">
                          <Car className="size-3 text-muted-foreground" /> {info.vehicleNum}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      className="p-3 max-w-[100px] truncate text-slate-500 font-semibold"
                      title={info.service}
                    >
                      {info.service}
                    </td>
                    <td className="p-3">{staffLabel(t.assignee) || t.assignee}</td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold border",
                          priorityBadgeClass(t.priority),
                        )}
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td className="p-3 font-mono">
                      {t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-IN") : "—"}
                    </td>
                    <td className="p-3">
                      <select
                        value={t.status}
                        onChange={(e) => onChangeStatus(t, e.target.value as TaskStatus)}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold border bg-transparent cursor-pointer",
                          statusBadgeClass(t.status),
                        )}
                      >
                        {TASK_STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 font-mono text-[10px]">{getSubtasksProgress(t) || "—"}</td>
                    <td
                      className="p-3 max-w-[180px] truncate text-gray-600 italic"
                      title={t.lastRemark || "No remarks"}
                    >
                      {t.lastRemark || "No remarks"}
                    </td>
                    <td className="p-3 text-gray-500">
                      {t.lastRemarkBy
                        ? staffLabel(t.lastRemarkBy) || t.lastRemarkBy
                        : staffLabel(t.createdBy) || t.createdBy}
                    </td>
                    <td className="p-3 font-mono text-gray-500">
                      {t.lastRemarkAt
                        ? new Date(t.lastRemarkAt).toLocaleDateString("en-IN")
                        : new Date(t.createdAt).toLocaleDateString("en-IN")}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => onView(t)}
                          title="View Detail"
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => onEdit(t)}
                          title="Edit Task"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => onAddRemark(t)}
                          title="Add Remark"
                        >
                          <MessageSquare className="size-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => onDelete(t)}
                            className="text-red-500 hover:bg-red-50"
                            title="Delete Task"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginatedTasks.length === 0 && (
                <tr>
                  <td colSpan={13} className="p-6 text-center text-muted-foreground">
                    No tasks match the active filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="p-3 bg-slate-50 border-t flex items-center justify-between text-xs text-muted-foreground select-none">
            <span>
              Page {currentPage} of {totalPages} ({tasks.length} total tasks)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="xs"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="xs"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Task Form Dialog ────────────────────────────────────────────────────────
function TaskFormDialog({
  open,
  onClose,
  editing,
  clients,
  leads,
  vehicles,
  actor,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  editing: Task | null;
  clients: RegistryRecord[];
  leads: RegistryRecord[];
  vehicles: any[];
  actor: string;
  isAdmin: boolean;
}) {
  const [title, setTitle] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string>(STAFF_USERS[0]?.username ?? "");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [status, setStatus] = useState<TaskStatus>("Assigned");
  const [associationType, setAssociationType] = useState<AssociationType>("client");
  const [recordId, setRecordId] = useState<string>("");
  const [vehicleId, setVehicleId] = useState<string>("");
  const [recordSearch, setRecordSearch] = useState("");
  const [dueDate, setDueDate] = useState<string>("");
  const [dueTime, setDueTime] = useState<string>("");
  const [reminderMinutes, setReminderMinutes] = useState<string>("0");
  const [saving, setSaving] = useState(false);

  // Subtasks and Templates
  const [checklist, setChecklist] = useState<TaskSubtask[]>([]);
  const [newSubtaskInput, setNewSubtaskInput] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setServiceName(editing.serviceName ?? "");
      setDescription(editing.description ?? "");
      setAssignee(editing.assignee);
      setPriority(editing.priority);
      setStatus(editing.status);
      setAssociationType(editing.associationType);
      setRecordId(editing.recordId ?? "");
      setVehicleId(editing.vehicleId ?? "");
      if (editing.dueDate) {
        const d = new Date(editing.dueDate);
        setDueDate(d.toISOString().slice(0, 10));
        setDueTime(d.toTimeString().slice(0, 5));
      } else {
        setDueDate("");
        setDueTime("");
      }
      setReminderMinutes(String(editing.reminderMinutes ?? 0));
      setChecklist(editing.subtasks ?? []);
    } else {
      setTitle("");
      setServiceName("");
      setDescription("");
      setAssignee(STAFF_USERS[0]?.username ?? "");
      setPriority("Medium");
      setStatus("Assigned");
      setAssociationType("client");
      setRecordId("");
      setVehicleId("");
      setRecordSearch("");
      setDueDate("");
      setDueTime("");
      setReminderMinutes("0");
      setChecklist([]);
    }
  }, [open, editing]);

  // Handle service templates lookup
  const handleServiceSelect = (val: string) => {
    setServiceName(val);
    if (!title.trim()) {
      setTitle(`${val} Processing`);
    }
    const subtaskTitles = SERVICE_TEMPLATES[val];
    if (subtaskTitles) {
      const generated: TaskSubtask[] = subtaskTitles.map((sub) => ({
        id: crypto.randomUUID(),
        title: sub,
        completed: false,
      }));
      setChecklist(generated);
    }
  };

  const clientVehicles = useMemo(() => {
    if (!recordId) return [];
    return vehicles.filter((v) => v.clientId === recordId);
  }, [recordId, vehicles]);

  const recordOptions = useMemo(() => {
    const src = associationType === "client" ? clients : associationType === "lead" ? leads : [];
    const q = recordSearch.toLowerCase().trim();
    if (!q) return src.slice(0, 30);
    return src
      .filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.mvNo.toLowerCase().includes(q) ||
          r.work.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [associationType, clients, leads, recordSearch]);

  const addManualSubtask = () => {
    if (!newSubtaskInput.trim()) return;
    const item: TaskSubtask = {
      id: crypto.randomUUID(),
      title: newSubtaskInput.trim(),
      completed: false,
    };
    setChecklist([...checklist, item]);
    setNewSubtaskInput("");
  };

  const removeSubtaskItem = (index: number) => {
    setChecklist(checklist.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!title.trim() || !assignee) return;
    if (associationType === "none" || !recordId) {
      toast.error("Connecting a Client or Lead is required.");
      return;
    }
    setSaving(true);
    try {
      const dueIso = dueDate
        ? new Date(`${dueDate}T${dueTime || "09:00"}:00`).toISOString()
        : undefined;
      const bucket: Bucket | undefined =
        associationType === "client" ? "clients" : associationType === "lead" ? "leads" : undefined;
      const rec = recordId || undefined;

      if (editing) {
        await updateTask(
          editing.id,
          {
            title: title.trim(),
            serviceName: serviceName.trim(),
            description,
            assignee,
            priority,
            status,
            done: status === "Completed",
            dueDate: dueIso,
            reminderMinutes: Number(reminderMinutes) || 0,
            associationType,
            bucket,
            recordId: rec,
            vehicleId: vehicleId || undefined,
          },
          actor,
          "Task edited",
        );
      } else {
        await createManualTask({
          title: title.trim(),
          serviceName: serviceName.trim(),
          description,
          assignee,
          priority,
          status,
          dueDate: dueIso,
          reminderMinutes: Number(reminderMinutes) || 0,
          associationType,
          bucket,
          recordId: rec,
          vehicleId: vehicleId || undefined,
          createdBy: actor,
          subtasks: checklist,
        });
      }
      onClose();
    } catch (error) {
      console.error("❌ Task operation failed:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to ${editing ? "update" : "create"} task:\n\n${message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit task" : "Create new task"}</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Assign work to a staff member and link it to a client or lead."
              : "Update this task's details."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Service Selector Dropdown */}
          <div className="grid gap-1.5">
            <Label>Select Service (Pre-populates Checklist)</Label>
            <Select value={serviceName} onValueChange={handleServiceSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Choose service type..." />
              </SelectTrigger>
              <SelectContent>
                {PREDEFINED_SERVICES.map((srv) => (
                  <SelectItem key={srv} value={srv}>
                    {srv}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Task title *</Label>
            <Input
              required
              placeholder="Enter task name (e.g. Insurance Renewal Processing)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Description</Label>
            <Textarea
              placeholder="Details of the job…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-3">
            <div className="grid gap-1.5">
              <Label>Link connection *</Label>
              <Select
                value={associationType}
                onValueChange={(v) => {
                  setAssociationType(v as AssociationType);
                  setRecordId("");
                  setRecordSearch("");
                  setVehicleId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Link to Client</SelectItem>
                  <SelectItem value="lead">Link to Lead</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Search & select {associationType} *</Label>
              <div className="space-y-1">
                <Input
                  placeholder="Type to search registry…"
                  value={recordSearch}
                  onChange={(e) => setRecordSearch(e.target.value)}
                />
                <Select
                  value={recordId}
                  onValueChange={(val) => {
                    setRecordId(val);
                    setVehicleId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`Select a ${associationType}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {recordOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name} {o.mvNo ? `(${o.mvNo})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Vehicle Dropdown */}
          {associationType === "client" && recordId && (
            <div className="grid gap-1.5 border-t pt-3">
              <Label>Link Vehicle (Optional)</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select linked vehicle..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Vehicle Linked</SelectItem>
                  {clientVehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.vehicleNumber} {v.makeModel ? `— ${v.makeModel}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Checklist configurator preview / edit */}
          <div className="p-3 bg-slate-50 border rounded-lg space-y-2.5">
            <span className="text-[10px] uppercase font-bold text-gray-500 block">
              Configure Subtask Checklist
            </span>

            {/* Quick append input */}
            <div className="flex gap-2">
              <Input
                placeholder="Add custom subtask item..."
                value={newSubtaskInput}
                onChange={(e) => setNewSubtaskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addManualSubtask();
                  }
                }}
              />
              <Button type="button" size="sm" onClick={addManualSubtask}>
                Add
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-xs text-gray-600 max-h-40 overflow-y-auto pr-1">
              {checklist.map((st, i) => (
                <div
                  key={st.id || i}
                  className="flex items-center justify-between gap-2 bg-white p-1.5 rounded border"
                >
                  <span className="truncate">
                    {i + 1}. {st.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSubtaskItem(i)}
                    className="text-red-500 hover:text-red-800"
                  >
                    <Trash2 className="size-3 shrink-0" />
                  </button>
                </div>
              ))}
              {checklist.length === 0 && (
                <span className="text-xs text-muted-foreground italic col-span-2">
                  No checklist items configured
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-3">
            <div className="grid gap-1.5">
              <Label>Assignee *</Label>
              <Select value={assignee} onValueChange={setAssignee} disabled={!isAdmin}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_USERS.map((s) => (
                    <SelectItem key={s.username} value={s.username}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {editing && (
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-3">
            <div className="grid gap-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Due time</Label>
              <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Reminder</Label>
              <Select value={reminderMinutes} onValueChange={setReminderMinutes}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No reminder</SelectItem>
                  <SelectItem value="15">15 minutes before</SelectItem>
                  <SelectItem value="30">30 minutes before</SelectItem>
                  <SelectItem value="60">1 hour before</SelectItem>
                  <SelectItem value="1440">1 day before</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-3 mt-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : editing ? (
              "Save Changes"
            ) : (
              "Create Task"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Task Details Sheet ──────────────────────────────────────────────────────
function TaskDetailsSheet({
  open,
  onClose,
  task,
  clients,
  leads,
  vehicles,
  actor,
  isAdmin,
  onEdit,
}: {
  open: boolean;
  onClose: () => void;
  task: Task;
  clients: RegistryRecord[];
  leads: RegistryRecord[];
  vehicles: any[];
  actor: string;
  isAdmin: boolean;
  onEdit: (t: Task) => void;
}) {
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  const linked = useMemo(() => {
    if (!task.recordId) return null;
    const src = task.bucket === "leads" ? leads : clients;
    return src.find((r) => r.id === task.recordId) ?? null;
  }, [task, clients, leads]);

  const linkedVehicle = useMemo(() => {
    if (!task.vehicleId) return null;
    return vehicles.find((v) => v.id === task.vehicleId) ?? null;
  }, [task, vehicles]);

  const sortedComments = useMemo(() => {
    return [...(task.comments ?? [])].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [task.comments]);

  const MAX_ATTACH_MB = 10;
  const onFile = (file: File) => {
    if (file.size > MAX_ATTACH_MB * 1024 * 1024) {
      alert(`File exceeds size limit of ${MAX_ATTACH_MB} MB.`);
      return;
    }
    setUploading(true);
    setUploadPct(0);
    const storageKey = `tasks/${task.id}/${crypto.randomUUID()}-${file.name}`;
    const fileRef = ref(storage, storageKey);
    const uploadTask = uploadBytesResumable(fileRef, file);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        setUploadPct(pct);
      },
      (error) => {
        console.error("Upload failed:", error);
        alert("Upload failed. Please try again.");
        setUploading(false);
      },
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        const attachment: TaskAttachment = {
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          type: file.type,
          storageKey,
          downloadUrl,
          addedAt: new Date().toISOString(),
          addedBy: actor,
        };
        await addAttachment(task.id, attachment);
        setUploading(false);
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="pr-8">{task.title}</SheetTitle>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-1.5 pt-1">
            <Badge variant="outline" className={cn("border", priorityBadgeClass(task.priority))}>
              {task.priority}
            </Badge>
            <Badge variant="outline" className={cn("border", statusBadgeClass(task.status))}>
              {task.status}
            </Badge>
            {task.recordId && (
              <Badge
                variant="outline"
                className="border bg-primary/10 text-primary border-primary/20"
              >
                <Link2 className="size-3 mr-1" />
                {task.bucket}
              </Badge>
            )}
            {linkedVehicle && (
              <Badge
                variant="outline"
                className="border bg-slate-100 text-slate-700 border-slate-200"
              >
                <Car className="size-3 mr-1" />
                {linkedVehicle.vehicleNumber}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <div className="flex gap-2 mt-4 mb-4">
          <Button variant="outline" size="sm" onClick={() => generateTaskPDF(task)}>
            <Download className="size-4 mr-1" />
            Export PDF
          </Button>
          <Button variant="outline" size="sm" onClick={printWindow}>
            <Printer className="size-4 mr-1" />
            Print
          </Button>
        </div>

        <div className="space-y-6">
          {/* Quick status & reassignment */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={task.status}
                onValueChange={(v) => {
                  const s = v as TaskStatus;
                  updateTask(
                    task.id,
                    { status: s, done: s === "Completed" },
                    actor,
                    `Status → ${s}`,
                  );
                  if (s === "Completed") setTaskDone(task.id, true, actor);
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={() => onEdit(task)}>
                  <Pencil className="size-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>

            {isAdmin && <ReassignmentSection task={task} actor={actor} />}
          </div>

          <Section title="Description">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {task.description?.trim() ? task.description : "No description."}
            </p>
          </Section>

          {/* Subtasks checklist progress details */}
          <SubtasksSection task={task} actor={actor} />

          <Section title="Details">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Meta label="Assigned to" value={staffLabel(task.assignee) || task.assignee} />
              <Meta label="Created by" value={task.createdBy} />
              <Meta label="Due" value={task.dueDate ? formatDate(task.dueDate) : "—"} />
              <Meta
                label="Reminder"
                value={task.reminderMinutes ? `${task.reminderMinutes} min before` : "None"}
              />
              <Meta label="Created" value={new Date(task.createdAt).toLocaleString()} />
              <Meta label="Type" value={task.manual ? "Manual" : "Auto from record"} />
              {task.readBy && (
                <>
                  <Meta label="Read By" value={staffLabel(task.readBy) || task.readBy} />
                  <Meta
                    label="Read On"
                    value={task.readAt ? new Date(task.readAt).toLocaleString() : "—"}
                  />
                </>
              )}
              {task.lastUpdatedBy && task.lastUpdatedAt && (
                <>
                  <Meta
                    label="Last Updated By"
                    value={staffLabel(task.lastUpdatedBy) || task.lastUpdatedBy}
                  />
                  <Meta
                    label="Last Updated At"
                    value={new Date(task.lastUpdatedAt).toLocaleString()}
                  />
                </>
              )}
            </dl>
          </Section>

          {linked && (
            <Section title={`Linked ${task.bucket === "leads" ? "lead" : "client"}`}>
              <div className="rounded-lg border p-3 text-sm space-y-1 bg-muted/30">
                <div className="font-medium">{linked.name || "—"}</div>
                {linkedVehicle && (
                  <div className="font-semibold text-slate-700">
                    Vehicle: {linkedVehicle.vehicleNumber} ({linkedVehicle.makeModel || "—"})
                  </div>
                )}
                <div className="text-muted-foreground">Work: {linked.work || "—"}</div>
                <div className="text-muted-foreground">
                  Mobile: {linked.mo || "—"} • Status: {linked.status}
                </div>
              </div>
            </Section>
          )}

          <Section title="Attachments">
            <div className="space-y-2">
              {(task.attachments ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No attachments yet.</p>
              )}
              {(task.attachments ?? []).map((a) => (
                <a
                  key={a.id}
                  href={a.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Paperclip className="size-4" />
                  {a.name}
                  <span className="text-muted-foreground text-xs">
                    ({Math.round(a.size / 1024)} KB)
                  </span>
                  <ExternalLink className="size-3" />
                </a>
              ))}

              {uploading && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Uploading… {uploadPct}%
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                </div>
              )}

              <label
                className={cn(
                  "inline-flex items-center gap-2 text-sm cursor-pointer text-primary",
                  uploading && "opacity-50 pointer-events-none",
                )}
              >
                <Paperclip className="size-4" />
                Attach file (max {MAX_ATTACH_MB} MB)
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </Section>

          {/* Remarks input comments */}
          <Section title="Add Remark / Note">
            <div className="flex gap-2">
              <Input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a note…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && comment.trim()) {
                    addComment(task.id, actor, comment.trim());
                    setComment("");
                  }
                }}
              />
              <Button
                size="sm"
                onClick={() => {
                  if (comment.trim()) {
                    addComment(task.id, actor, comment.trim());
                    setComment("");
                  }
                }}
              >
                <Send className="size-4" />
              </Button>
            </div>
          </Section>

          {/* Remark History sorted latest first */}
          <Section title="Remark History">
            <div className="space-y-4">
              {sortedComments.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No remarks yet.</p>
              ) : (
                <div className="space-y-3 divide-y divide-dashed">
                  {sortedComments.map((c, i) => (
                    <div
                      key={c.id}
                      className={cn(
                        "text-sm pt-3 first:pt-0 border-none",
                        i > 0 && "border-t border-gray-100",
                      )}
                    >
                      <p className="font-semibold text-gray-800">{c.text}</p>
                      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                        <span className="font-bold text-primary">
                          {staffLabel(c.author) || c.author}
                        </span>
                        <span>
                          {new Date(c.at).toLocaleDateString("en-IN")} •{" "}
                          {new Date(c.at).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>

          <Section title="Activity timeline">
            <ol className="relative border-l pl-4 space-y-3">
              {(task.activityLogs ?? []).length > 0
                ? (task.activityLogs ?? []).map((log) => (
                    <li key={log.id} className="text-sm">
                      <span className="absolute -left-1.5 mt-1.5 w-2.5 h-2.5 rounded-full bg-primary" />
                      <div className="font-medium">{log.message}</div>
                      {log.before !== undefined && log.after !== undefined && (
                        <div className="text-xs text-muted-foreground">
                          {log.before} → {log.after}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {staffLabel(log.actor) || log.actor} • {new Date(log.at).toLocaleString()}
                      </div>
                    </li>
                  ))
                : (task.activity ?? []).map((a) => (
                    <li key={a.id} className="text-sm">
                      <span className="absolute -left-1.5 mt-1.5 w-2.5 h-2.5 rounded-full bg-primary" />
                      <div>{a.message}</div>
                      <div className="text-xs text-muted-foreground">
                        {staffLabel(a.actor) || a.actor} • {new Date(a.at).toLocaleString()}
                      </div>
                    </li>
                  ))}
            </ol>
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-t pt-4">
      <h4 className="text-xs uppercase font-bold text-gray-500 tracking-wide">{title}</h4>
      {children}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground font-medium">{label}</dt>
      <dd className="text-sm font-semibold text-foreground mt-0.5">{value}</dd>
    </div>
  );
}

function ReassignmentSection({ task, actor }: { task: Task; actor: string }) {
  return (
    <div className="flex items-center gap-2 border bg-slate-50 p-2.5 rounded-lg max-w-sm">
      <Users className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 text-xs font-semibold">Assignee</div>
      <Select value={task.assignee} onValueChange={(v) => reassignTask(task.id, v, actor)}>
        <SelectTrigger className="w-36 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STAFF_USERS.map((s) => (
            <SelectItem key={s.username} value={s.username} className="text-xs">
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SubtasksSection({ task, actor }: { task: Task; actor: string }) {
  const calculateProgress = (subs: any[]) => {
    if (!subs.length) return 0;
    const comp = subs.filter((s) => s.completed).length;
    return Math.round((comp / subs.length) * 100);
  };

  const items = useMemo(() => task.subtasks ?? [], [task.subtasks]);
  const completed = items.filter((s) => s.completed).length;
  const pct = calculateProgress(items);

  // Subtask form & remarks modal states
  const [editingSub, setEditingSub] = useState<TaskSubtask | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editDueDate, setEditDueDate] = useState("");

  const [remarkingSub, setRemarkingSub] = useState<TaskSubtask | null>(null);
  const [subRemarkText, setSubRemarkText] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [newAssignedTo, setNewAssignedTo] = useState("");
  const [newDueDate, setNewDueDate] = useState("");

  // Progress Bar Character Blocks helper
  const blockCount = Math.round(pct / 10);
  const blockString = "█".repeat(blockCount) + "░".repeat(10 - blockCount);

  const getProgressColor = (percent: number) => {
    if (percent <= 25) return "text-red-500 bg-red-500";
    if (percent <= 50) return "text-orange-500 bg-orange-500";
    if (percent <= 75) return "text-blue-500 bg-blue-500";
    return "text-green-500 bg-green-500";
  };

  // Add Subtask
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newSub: TaskSubtask = {
      id: crypto.randomUUID(),
      title: newTitle.trim(),
      completed: false,
      assignedTo: newAssignedTo || undefined,
      dueDate: newDueDate || undefined,
      createdBy: actor,
      createdAt: new Date().toISOString(),
      remarks: [],
    };

    const updated = [...items, newSub];
    await updateSubtasks(task.id, updated, actor);
    setNewTitle("");
    setNewAssignedTo("");
    setNewDueDate("");
    toast.success("Subtask added successfully!");
  };

  // Toggle Completion
  const handleToggle = async (sub: TaskSubtask) => {
    const updated = items.map((s) => {
      if (s.id === sub.id) {
        const nextCompleted = !s.completed;
        return {
          ...s,
          completed: nextCompleted,
          completedBy: nextCompleted ? actor : undefined,
          completedOn: nextCompleted ? new Date().toISOString() : undefined,
          completedAt: nextCompleted ? new Date().toISOString() : undefined,
          updatedBy: actor,
          updatedAt: new Date().toISOString(),
        };
      }
      return s;
    });
    await updateSubtasks(task.id, updated, actor);
    toast.success(sub.completed ? "Subtask reopened" : "Subtask completed!");
  };

  // Edit Subtask Dialog Save
  const handleSaveEdit = async () => {
    if (!editingSub || !editTitle.trim()) return;
    const updated = items.map((s) => {
      if (s.id === editingSub.id) {
        return {
          ...s,
          title: editTitle.trim(),
          assignedTo: editAssignedTo || undefined,
          dueDate: editDueDate || undefined,
          updatedBy: actor,
          updatedAt: new Date().toISOString(),
        };
      }
      return s;
    });
    await updateSubtasks(task.id, updated, actor);
    setEditingSub(null);
    toast.success("Subtask updated successfully!");
  };

  // Delete Subtask
  const handleDelete = async (subId: string) => {
    if (!confirm("Are you sure you want to delete this subtask?")) return;
    const updated = items.filter((s) => s.id !== subId);
    await updateSubtasks(task.id, updated, actor);
    toast.success("Subtask deleted!");
  };

  // Add Subtask Remark
  const handleAddSubRemark = async () => {
    if (!remarkingSub || !subRemarkText.trim()) return;
    const remarkObj = {
      id: crypto.randomUUID(),
      text: subRemarkText.trim(),
      author: actor,
      at: new Date().toISOString(),
    };
    const updated = items.map((s) => {
      if (s.id === remarkingSub.id) {
        return {
          ...s,
          remarks: [...(s.remarks || []), remarkObj],
          updatedBy: actor,
          updatedAt: new Date().toISOString(),
        };
      }
      return s;
    });
    await updateSubtasks(task.id, updated, actor);
    setSubRemarkText("");
    setRemarkingSub(null);
    toast.success("Subtask remark logged!");
  };

  // Move Subtask (Reorder Up/Down)
  const handleMove = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const list = [...items];
    const [moved] = list.splice(index, 1);
    list.splice(targetIndex, 0, moved);

    await updateSubtasks(task.id, list, actor);
  };

  return (
    <Section title="Subtask Workflow Tracker">
      <div className="space-y-4">
        {/* Professional Progress Segment */}
        <div className="bg-slate-50 p-3.5 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Progress Tracker
            </span>
            <div className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <span
                className={cn(
                  "font-mono font-bold text-xs px-2 py-0.5 rounded text-white",
                  getProgressColor(pct).split(" ")[1],
                )}
              >
                {pct}%
              </span>
              <span className="text-xs font-mono text-gray-600 tracking-wider font-semibold">
                {blockString}
              </span>
            </div>
          </div>
          <div className="text-xs text-slate-500 text-right font-medium">
            <strong>{completed}</strong> of <strong>{items.length}</strong> Tasks Completed
          </div>
        </div>

        {/* Subtasks checklist items */}
        <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
          {items.map((st, index) => {
            const hasRemarks = (st.remarks || []).length > 0;
            return (
              <div
                key={st.id}
                className={cn(
                  "border rounded-xl p-3 bg-white hover:border-slate-300 transition shadow-sm",
                  st.completed && "bg-slate-50/50 border-slate-200",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <Checkbox
                      checked={st.completed}
                      onCheckedChange={() => handleToggle(st)}
                      className="mt-1 size-4.5 rounded cursor-pointer"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p
                        className={cn(
                          "text-xs font-bold text-gray-800 leading-tight truncate",
                          st.completed && "line-through text-muted-foreground",
                        )}
                      >
                        {index + 1}. {st.title}
                      </p>

                      {/* Professional metadata tracker */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500 font-semibold mt-1">
                        {!st.completed ? (
                          <>
                            <span>
                              Assigned:{" "}
                              <strong className="text-gray-700">
                                {st.assignedTo ? staffLabel(st.assignedTo) : "Unassigned"}
                              </strong>
                            </span>
                            {st.dueDate && (
                              <span>
                                Due:{" "}
                                <strong className="text-amber-700">
                                  {new Date(st.dueDate).toLocaleDateString("en-IN")}
                                </strong>
                              </span>
                            )}
                            <span className="text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/50">
                              Status: Pending
                            </span>
                          </>
                        ) : (
                          <>
                            <span>
                              Completed By:{" "}
                              <strong className="text-emerald-700">
                                {st.completedBy ? staffLabel(st.completedBy) : "System"}
                              </strong>
                            </span>
                            {st.completedOn && (
                              <span>
                                Completed On:{" "}
                                <strong className="text-emerald-700">
                                  {new Date(st.completedOn).toLocaleDateString("en-IN")}
                                </strong>
                              </span>
                            )}
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/50">
                              Status: Completed
                            </span>
                          </>
                        )}
                      </div>

                      {/* Subtask Remarks History Timeline inside Row */}
                      {hasRemarks && (
                        <div className="bg-slate-50 border rounded-lg p-2 mt-2 space-y-1.5">
                          <span className="text-[9px] uppercase font-bold text-gray-400 block tracking-wide">
                            Remarks History
                          </span>
                          <div className="space-y-1.5 divide-y divide-dashed">
                            {(st.remarks || []).map((rem) => (
                              <div
                                key={rem.id}
                                className="text-[10px] text-gray-600 pt-1 first:pt-0 border-none"
                              >
                                <p className="font-medium">{rem.text}</p>
                                <div className="text-[8px] text-gray-400 mt-0.5 flex justify-between font-bold">
                                  <span>{staffLabel(rem.author) || rem.author}</span>
                                  <span>
                                    {new Date(rem.at).toLocaleDateString("en-IN")} •{" "}
                                    {new Date(rem.at).toLocaleTimeString("en-IN", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Operational actions: Edit, Reorder, Add Remark, Delete */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSub(st);
                        setEditTitle(st.title);
                        setEditAssignedTo(st.assignedTo || "");
                        setEditDueDate(st.dueDate || "");
                      }}
                      className="text-gray-400 hover:text-primary p-1 rounded hover:bg-slate-100"
                      title="Edit Subtask"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemarkingSub(st)}
                      className="text-gray-400 hover:text-primary p-1 rounded hover:bg-slate-100"
                      title="Add Remark"
                    >
                      <MessageSquare className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMove(index, "up")}
                      className="text-gray-400 hover:text-gray-800 disabled:opacity-30 p-1 rounded hover:bg-slate-100"
                      title="Move Up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={index === items.length - 1}
                      onClick={() => handleMove(index, "down")}
                      className="text-gray-400 hover:text-gray-800 disabled:opacity-30 p-1 rounded hover:bg-slate-100"
                      title="Move Down"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(st.id)}
                      className="text-red-400 hover:text-red-700 p-1 rounded hover:bg-red-50"
                      title="Delete Subtask"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="text-center py-10 border border-dashed rounded-xl bg-slate-50/50">
              <CheckCircle className="size-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400 italic">
                No checklist workflow subtasks configured yet.
              </p>
            </div>
          )}
        </div>

        {/* Add Subtask Form */}
        <form onSubmit={handleAdd} className="border-t pt-3.5 space-y-2">
          <span className="text-[10px] uppercase font-bold text-gray-500 block">
            Add New Checklist Item
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-3">
              <Input
                required
                placeholder="Enter subtask workflow name (e.g. Collect RC Copy)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div>
              <Select value={newAssignedTo} onValueChange={setNewAssignedTo}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Assign Employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {STAFF_USERS.map((s) => (
                    <SelectItem key={s.username} value={s.username}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Input
                type="date"
                className="h-9 text-xs"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" className="h-9 gap-1 text-xs">
              <Plus className="size-3.5" /> Add Subtask
            </Button>
          </div>
        </form>
      </div>

      {/* Edit Subtask Modal Dialog */}
      {editingSub && (
        <Dialog open={!!editingSub} onOpenChange={(v) => !v && setEditingSub(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Subtask Settings</DialogTitle>
              <DialogDescription>
                Modify operational details for this checklist process item.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="editSubTitle" className="text-xs uppercase font-bold text-gray-500">
                  Subtask Title *
                </Label>
                <Input
                  id="editSubTitle"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor="editSubAssign"
                  className="text-xs uppercase font-bold text-gray-500"
                >
                  Assigned Employee
                </Label>
                <Select value={editAssignedTo} onValueChange={setEditAssignedTo}>
                  <SelectTrigger id="editSubAssign">
                    <SelectValue placeholder="Select staff..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {STAFF_USERS.map((s) => (
                      <SelectItem key={s.username} value={s.username}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="editSubDue" className="text-xs uppercase font-bold text-gray-500">
                  Due Date
                </Label>
                <Input
                  id="editSubDue"
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => setEditingSub(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Subtask Remark Dialog */}
      {remarkingSub && (
        <Dialog open={!!remarkingSub} onOpenChange={(v) => !v && setRemarkingSub(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Log Subtask Remark</DialogTitle>
              <DialogDescription>
                Add operational remark history for subtask: <strong>{remarkingSub.title}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="py-2 space-y-2">
              <Label htmlFor="subRemarkText" className="text-xs uppercase font-bold text-gray-500">
                Remark Text *
              </Label>
              <Textarea
                id="subRemarkText"
                rows={3}
                required
                placeholder="e.g. Hard copy received."
                value={subRemarkText}
                onChange={(e) => setSubRemarkText(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => setRemarkingSub(null)}>
                Cancel
              </Button>
              <Button onClick={handleAddSubRemark} disabled={!subRemarkText.trim()}>
                Log Remark
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Section>
  );
}
