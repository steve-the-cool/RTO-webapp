import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Trash2, Plus, Link2, Search, Pencil, CheckCircle2, Eye, Paperclip, Send, Calendar as CalIcon, Clock, AlertTriangle,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { STAFF_USERS, staffLabel, loadRecords, type Bucket, type RegistryRecord } from "@/lib/records";
import {
  loadTasks, createManualTask, setTaskDone, removeTask, updateTask, addComment, addAttachment,
  PRIORITY_OPTIONS, TASK_STATUS_OPTIONS,
  type Task, type TaskStatus, type TaskPriority, type AssociationType,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/tasks")({ component: TasksPage });

type SortMode = "latest" | "oldest" | "priority" | "due";

const PRIORITY_RANK: Record<TaskPriority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

const priorityBadgeClass = (p: TaskPriority) => ({
  Urgent: "bg-red-100 text-red-700 border-red-200",
  High: "bg-orange-100 text-orange-700 border-orange-200",
  Medium: "bg-blue-100 text-blue-700 border-blue-200",
  Low: "bg-slate-100 text-slate-600 border-slate-200",
}[p]);

const statusBadgeClass = (s: TaskStatus) => ({
  Pending: "bg-amber-100 text-amber-700 border-amber-200",
  "In Progress": "bg-indigo-100 text-indigo-700 border-indigo-200",
  Completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  "On Hold": "bg-zinc-100 text-zinc-700 border-zinc-200",
}[s]);

function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function isOverdue(t: Task) {
  return !!t.dueDate && !t.done && new Date(t.dueDate).getTime() < Date.now();
}

function TasksPage() {
  const [session, setSession] = useState<ReturnType<typeof getSession>>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<RegistryRecord[]>([]);
  const [leads, setLeads] = useState<RegistryRecord[]>([]);

  // filters
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [associationFilter, setAssociationFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<string>("all"); // all|overdue|today|week
  const [sort, setSort] = useState<SortMode>("latest");

  // dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  useEffect(() => {
    setSession(getSession());
    const refresh = () => {
      setTasks(loadTasks());
      setClients(loadRecords("clients"));
      setLeads(loadRecords("leads"));
    };
    refresh();
    window.addEventListener("tasks-change", refresh);
    window.addEventListener("records-change", refresh);
    return () => {
      window.removeEventListener("tasks-change", refresh);
      window.removeEventListener("records-change", refresh);
    };
  }, []);

  const isAdmin = session?.role === "admin";
  const detailsTask = tasks.find((t) => t.id === detailsId) ?? null;

  const visible = useMemo(() => {
    if (!session) return [];
    let list = isAdmin ? tasks : tasks.filter((t) => t.assignee === session.username);

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        staffLabel(t.assignee).toLowerCase().includes(q));
    }
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (priorityFilter !== "all") list = list.filter((t) => t.priority === priorityFilter);
    if (assigneeFilter !== "all") list = list.filter((t) => t.assignee === assigneeFilter);
    if (associationFilter !== "all") list = list.filter((t) => t.associationType === associationFilter);

    if (dueFilter !== "all") {
      const now = Date.now();
      const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
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
  }, [tasks, isAdmin, session, query, statusFilter, priorityFilter, assigneeFilter, associationFilter, dueFilter, sort]);

  const stats = useMemo(() => ({
    total: visible.length,
    pending: visible.filter((t) => !t.done).length,
    overdue: visible.filter(isOverdue).length,
    completed: visible.filter((t) => t.done).length,
  }), [visible]);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (t: Task) => { setEditing(t); setFormOpen(true); };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tasks</h2>
          <p className="text-sm text-muted-foreground">
            {stats.total} total • {stats.pending} pending • {stats.overdue} overdue • {stats.completed} done
            {isAdmin ? " • Admin view" : " • Your tasks"}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate}><Plus className="size-4 mr-1" />Add task</Button>
        )}
      </div>

      {/* Search + filters */}
      <div className="rounded-xl border bg-card p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search tasks by title, description, assignee…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {TASK_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priority</SelectItem>
              {PRIORITY_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter} disabled={!isAdmin}>
            <SelectTrigger><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff</SelectItem>
              {STAFF_USERS.map((s) => <SelectItem key={s.username} value={s.username}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={associationFilter} onValueChange={setAssociationFilter}>
            <SelectTrigger><SelectValue placeholder="Linked to" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All links</SelectItem>
              <SelectItem value="client">Client</SelectItem>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="none">Standalone</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dueFilter} onValueChange={setDueFilter}>
            <SelectTrigger><SelectValue placeholder="Due date" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any due date</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="today">Due today</SelectItem>
              <SelectItem value="week">Due this week</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
            <SelectTrigger><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">Latest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="priority">Priority (high → low)</SelectItem>
              <SelectItem value="due">Due date (soonest)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Task list */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {visible.length === 0 && (
          <div className="col-span-full rounded-xl border bg-card p-8 text-center text-muted-foreground text-sm">
            No tasks match your filters.
          </div>
        )}
        {visible.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            isAdmin={!!isAdmin}
            onView={() => setDetailsId(t.id)}
            onEdit={() => openEdit(t)}
            onDelete={() => { if (confirm("Delete this task?")) removeTask(t.id); }}
            onToggleDone={(v) => setTaskDone(t.id, v, session?.username ?? "system")}
          />
        ))}
      </div>

      <TaskFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        clients={clients}
        leads={leads}
        actor={session?.username ?? "admin"}
        isAdmin={!!isAdmin}
      />

      <TaskDetailsSheet
        task={detailsTask}
        open={!!detailsTask}
        onClose={() => setDetailsId(null)}
        clients={clients}
        leads={leads}
        actor={session?.username ?? "staff"}
        isAdmin={!!isAdmin}
        onEdit={(t) => { setDetailsId(null); openEdit(t); }}
      />
    </div>
  );
}

/* ---------- Task card ---------- */

function TaskCard({ task, isAdmin, onView, onEdit, onDelete, onToggleDone }: {
  task: Task; isAdmin: boolean;
  onView: () => void; onEdit: () => void; onDelete: () => void; onToggleDone: (v: boolean) => void;
}) {
  const overdue = isOverdue(task);
  return (
    <div className={cn("rounded-xl border bg-card p-4 flex flex-col gap-3 hover:shadow-md transition-shadow",
      overdue && "border-red-300")}>
      <div className="flex items-start gap-3">
        <Checkbox className="mt-1" checked={task.done} onCheckedChange={(v) => onToggleDone(Boolean(v))} />
        <div className="flex-1 min-w-0">
          <button className="text-left w-full" onClick={onView}>
            <div className={cn("font-semibold leading-snug", task.done && "line-through text-muted-foreground")}>
              {task.title}
            </div>
          </button>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge variant="outline" className={cn("border", priorityBadgeClass(task.priority))}>{task.priority}</Badge>
            <Badge variant="outline" className={cn("border", statusBadgeClass(task.status))}>{task.status}</Badge>
            {task.recordId && (
              <Badge variant="outline" className="border bg-primary/10 text-primary border-primary/20">
                <Link2 className="size-3 mr-1" />{task.bucket}
              </Badge>
            )}
            {overdue && (
              <Badge variant="outline" className="border bg-red-100 text-red-700 border-red-200">
                <AlertTriangle className="size-3 mr-1" />Overdue
              </Badge>
            )}
          </div>
        </div>
      </div>

      {task.description && (
        <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
      )}

      <div className="text-xs text-muted-foreground grid grid-cols-2 gap-2">
        <div>👤 {staffLabel(task.assignee) || task.assignee}</div>
        <div className="flex items-center gap-1"><CalIcon className="size-3" />{task.dueDate ? formatDate(task.dueDate) : "No due date"}</div>
        <div className="col-span-2 flex items-center gap-1 text-[11px] opacity-70">
          <Clock className="size-3" />Created {new Date(task.createdAt).toLocaleDateString()}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1 pt-1 border-t">
        <Button variant="ghost" size="sm" onClick={onView}><Eye className="size-4 mr-1" />View</Button>
        {!task.done && (
          <Button variant="ghost" size="sm" onClick={() => onToggleDone(true)}>
            <CheckCircle2 className="size-4 mr-1" />Complete
          </Button>
        )}
        {isAdmin && <Button variant="ghost" size="sm" onClick={onEdit}><Pencil className="size-4" /></Button>}
        {isAdmin && <Button variant="ghost" size="sm" onClick={onDelete}><Trash2 className="size-4 text-destructive" /></Button>}
      </div>
    </div>
  );
}

/* ---------- Create / edit dialog ---------- */

function TaskFormDialog({ open, onClose, editing, clients, leads, actor, isAdmin }: {
  open: boolean; onClose: () => void; editing: Task | null;
  clients: RegistryRecord[]; leads: RegistryRecord[]; actor: string; isAdmin: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string>(STAFF_USERS[0]?.username ?? "");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [status, setStatus] = useState<TaskStatus>("Pending");
  const [associationType, setAssociationType] = useState<AssociationType>("none");
  const [recordId, setRecordId] = useState<string>("");
  const [recordSearch, setRecordSearch] = useState("");
  const [dueDate, setDueDate] = useState<string>(""); // yyyy-mm-dd
  const [dueTime, setDueTime] = useState<string>(""); // HH:mm
  const [reminderMinutes, setReminderMinutes] = useState<string>("0");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? "");
      setAssignee(editing.assignee);
      setPriority(editing.priority);
      setStatus(editing.status);
      setAssociationType(editing.associationType);
      setRecordId(editing.recordId ?? "");
      if (editing.dueDate) {
        const d = new Date(editing.dueDate);
        setDueDate(d.toISOString().slice(0, 10));
        setDueTime(d.toTimeString().slice(0, 5));
      } else { setDueDate(""); setDueTime(""); }
      setReminderMinutes(String(editing.reminderMinutes ?? 0));
    } else {
      setTitle(""); setDescription("");
      setAssignee(STAFF_USERS[0]?.username ?? "");
      setPriority("Medium"); setStatus("Pending");
      setAssociationType("none"); setRecordId(""); setRecordSearch("");
      setDueDate(""); setDueTime(""); setReminderMinutes("0");
    }
  }, [open, editing]);

  const recordOptions = useMemo(() => {
    const src = associationType === "client" ? clients : associationType === "lead" ? leads : [];
    const q = recordSearch.toLowerCase().trim();
    if (!q) return src.slice(0, 30);
    return src.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      r.mvNo.toLowerCase().includes(q) ||
      r.work.toLowerCase().includes(q)).slice(0, 30);
  }, [associationType, clients, leads, recordSearch]);

  const submit = () => {
    if (!title.trim() || !assignee) return;
    const dueIso = dueDate ? new Date(`${dueDate}T${dueTime || "09:00"}:00`).toISOString() : undefined;
    const bucket: Bucket | undefined = associationType === "client" ? "clients" : associationType === "lead" ? "leads" : undefined;
    const rec = associationType === "none" ? undefined : recordId || undefined;

    if (editing) {
      updateTask(editing.id, {
        title: title.trim(), description, assignee, priority, status,
        done: status === "Completed",
        dueDate: dueIso, reminderMinutes: Number(reminderMinutes) || 0,
        associationType, bucket, recordId: rec,
      }, actor, "Task edited");
    } else {
      createManualTask({
        title: title.trim(), description, assignee, priority, status,
        dueDate: dueIso, reminderMinutes: Number(reminderMinutes) || 0,
        associationType, bucket, recordId: rec, createdBy: actor,
      });
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit task" : "Create new task"}</DialogTitle>
          <DialogDescription>
            {isAdmin ? "Assign work to a staff member and link it to a client or lead." : "Update this task's details."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Task title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Follow up on insurance renewal" />
          </div>

          <div className="grid gap-1.5">
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes, context, what needs to be done…" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Associate with</Label>
              <Select value={associationType} onValueChange={(v) => { setAssociationType(v as AssociationType); setRecordId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Assign to</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue placeholder="Choose staff" /></SelectTrigger>
                <SelectContent>
                  {STAFF_USERS.map((s) => <SelectItem key={s.username} value={s.username}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {associationType !== "none" && (
            <div className="grid gap-1.5">
              <Label>Select {associationType}</Label>
              <Input placeholder={`Search ${associationType} by name, MV no, work…`}
                value={recordSearch} onChange={(e) => setRecordSearch(e.target.value)} />
              <Select value={recordId} onValueChange={setRecordId}>
                <SelectTrigger><SelectValue placeholder={`Pick a ${associationType}`} /></SelectTrigger>
                <SelectContent>
                  {recordOptions.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>}
                  {recordOptions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name || "(no name)"} — {r.mvNo || "no MV"} • {r.work || r.application || "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Due time (optional)</Label>
              <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Reminder before due</Label>
              <Select value={reminderMinutes} onValueChange={setReminderMinutes}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No reminder</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="1440">1 day</SelectItem>
                  <SelectItem value="2880">2 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!title.trim() || !assignee || (associationType !== "none" && !recordId)}>
            {editing ? "Save changes" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Details sheet ---------- */

function TaskDetailsSheet({ task, open, onClose, clients, leads, actor, isAdmin, onEdit }: {
  task: Task | null; open: boolean; onClose: () => void;
  clients: RegistryRecord[]; leads: RegistryRecord[]; actor: string; isAdmin: boolean;
  onEdit: (t: Task) => void;
}) {
  const [comment, setComment] = useState("");

  if (!task) return null;
  const linked = task.recordId
    ? (task.bucket === "leads" ? leads : clients).find((r) => r.id === task.recordId)
    : null;

  const onFile = (file: File) => {
    if (file.size > 500_000) { alert("File too large (max 500 KB in demo storage)"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      addAttachment(task.id, {
        id: crypto.randomUUID(),
        name: file.name, size: file.size, type: file.type,
        dataUrl: String(reader.result),
        addedAt: new Date().toISOString(), addedBy: actor,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="pr-8">{task.title}</SheetTitle>
          <SheetDescription className="flex flex-wrap gap-1.5 pt-1">
            <Badge variant="outline" className={cn("border", priorityBadgeClass(task.priority))}>{task.priority}</Badge>
            <Badge variant="outline" className={cn("border", statusBadgeClass(task.status))}>{task.status}</Badge>
            {task.recordId && (
              <Badge variant="outline" className="border bg-primary/10 text-primary border-primary/20">
                <Link2 className="size-3 mr-1" />{task.bucket}
              </Badge>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-4">
          {/* Quick status */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={task.status} onValueChange={(v) => {
              const s = v as TaskStatus;
              updateTask(task.id, { status: s, done: s === "Completed" }, actor, `Status → ${s}`);
              if (s === "Completed") setTaskDone(task.id, true, actor);
            }}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {isAdmin && <Button variant="outline" size="sm" onClick={() => onEdit(task)}><Pencil className="size-4 mr-1" />Edit</Button>}
          </div>

          {/* Description */}
          <Section title="Description">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {task.description?.trim() ? task.description : "No description."}
            </p>
          </Section>

          {/* Meta */}
          <Section title="Details">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Meta label="Assigned to" value={staffLabel(task.assignee) || task.assignee} />
              <Meta label="Created by" value={task.createdBy} />
              <Meta label="Due" value={task.dueDate ? formatDate(task.dueDate) : "—"} />
              <Meta label="Reminder" value={task.reminderMinutes ? `${task.reminderMinutes} min before` : "None"} />
              <Meta label="Created" value={new Date(task.createdAt).toLocaleString()} />
              <Meta label="Type" value={task.manual ? "Manual" : "Auto from record"} />
            </dl>
          </Section>

          {/* Linked record */}
          {linked && (
            <Section title={`Linked ${task.bucket === "leads" ? "lead" : "client"}`}>
              <div className="rounded-lg border p-3 text-sm space-y-1 bg-muted/30">
                <div className="font-medium">{linked.name || "—"}</div>
                <div className="text-muted-foreground">MV: {linked.mvNo || "—"} • Work: {linked.work || "—"}</div>
                <div className="text-muted-foreground">Mobile: {linked.mo || "—"} • Status: {linked.status}</div>
              </div>
            </Section>
          )}

          {/* Attachments */}
          <Section title="Attachments">
            <div className="space-y-2">
              {(task.attachments ?? []).length === 0 && <p className="text-sm text-muted-foreground">No attachments yet.</p>}
              {(task.attachments ?? []).map((a) => (
                <a key={a.id} href={a.dataUrl} download={a.name}
                  className="flex items-center gap-2 text-sm text-primary hover:underline">
                  <Paperclip className="size-4" />{a.name} <span className="text-muted-foreground text-xs">({Math.round(a.size / 1024)} KB)</span>
                </a>
              ))}
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer text-primary">
                <Paperclip className="size-4" />Attach file
                <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }} />
              </label>
            </div>
          </Section>

          {/* Comments */}
          <Section title="Comments & notes">
            <div className="space-y-2">
              {(task.comments ?? []).length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
              {(task.comments ?? []).map((c) => (
                <div key={c.id} className="rounded-lg border p-2 text-sm">
                  <div className="text-xs text-muted-foreground">{staffLabel(c.author) || c.author} • {new Date(c.at).toLocaleString()}</div>
                  <div className="mt-1 whitespace-pre-wrap">{c.text}</div>
                </div>
              ))}
              <div className="flex gap-2">
                <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a note…"
                  onKeyDown={(e) => { if (e.key === "Enter" && comment.trim()) { addComment(task.id, actor, comment.trim()); setComment(""); } }} />
                <Button size="sm" onClick={() => { if (comment.trim()) { addComment(task.id, actor, comment.trim()); setComment(""); } }}>
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
          </Section>

          {/* Activity */}
          <Section title="Activity timeline">
            <ol className="relative border-l pl-4 space-y-3">
              {(task.activity ?? []).map((a) => (
                <li key={a.id} className="text-sm">
                  <span className="absolute -left-1.5 mt-1.5 w-2.5 h-2.5 rounded-full bg-primary" />
                  <div>{a.message}</div>
                  <div className="text-xs text-muted-foreground">{staffLabel(a.actor) || a.actor} • {new Date(a.at).toLocaleString()}</div>
                </li>
              ))}
              {(task.activity ?? []).length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
            </ol>
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</h4>
      {children}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
