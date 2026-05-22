import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Link2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { STAFF_USERS, staffLabel } from "@/lib/records";
import { loadTasks, createManualTask, setTaskDone, removeTask, type Task, type TaskStatus } from "@/lib/tasks";
import { saveTasks } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/tasks")({ component: TasksPage });

function TasksPage() {
  const [session, setSession] = useState<ReturnType<typeof getSession>>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string>(STAFF_USERS[0]?.username ?? "staff");
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    setSession(getSession());
    setTasks(loadTasks());
    const handler = () => setTasks(loadTasks());
    window.addEventListener("tasks-change", handler);
    window.addEventListener("records-change", handler);
    return () => {
      window.removeEventListener("tasks-change", handler);
      window.removeEventListener("records-change", handler);
    };
  }, []);

  const isAdmin = session?.role === "admin";

  const visible = useMemo(() => {
    if (!session) return [];
    if (!isAdmin) return tasks.filter((t) => t.assignee === session.username);
    if (filter === "all") return tasks;
    return tasks.filter((t) => t.assignee === filter);
  }, [tasks, isAdmin, filter, session]);

  const pending = visible.filter((t) => !t.done).length;

  const add = () => {
    if (!isAdmin) return;
    const trimmed = title.trim();
    if (!trimmed || !assignee) return;
    createManualTask({ title: trimmed, assignee, createdBy: session?.username ?? "admin" });
    setTitle("");
  };

  const updateStatus = (task: Task, status: TaskStatus) => {
    if (status === "Completed") {
      setTaskDone(task.id, true);
    } else {
      // update status without toggling record completion unless going from done -> not done
      if (task.done) {
        setTaskDone(task.id, false);
      }
      const all = loadTasks().map((t) => t.id === task.id ? { ...t, status, done: false } : t);
      saveTasks(all);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tasks</h2>
          <p className="text-sm text-muted-foreground">
            {pending} pending • {visible.length} total
            {isAdmin ? " • Admin view (all staff)" : " • Your assigned tasks"}
          </p>
        </div>
        {isAdmin && (
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff</SelectItem>
              {STAFF_USERS.map((s) => <SelectItem key={s.username} value={s.username}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {isAdmin ? (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="text-sm font-semibold">Assign new task to staff</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title…"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            />
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="sm:w-56"><SelectValue placeholder="Choose staff" /></SelectTrigger>
              <SelectContent>
                {STAFF_USERS.map((s) => <SelectItem key={s.username} value={s.username}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" onClick={add} disabled={!title.trim() || !assignee}>
              <Plus className="size-4 mr-1" />Add task
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
          Tasks are assigned by your admin. Update the status as you progress — completing a linked client/lead automatically marks the task done.
        </div>
      )}

      <div className="rounded-xl border bg-card divide-y">
        {visible.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">No tasks yet.</div>}
        {visible.map((t) => (
          <div key={t.id} className="flex items-start gap-3 px-4 py-3">
            <Checkbox className="mt-1" checked={t.done} onCheckedChange={(v) => setTaskDone(t.id, Boolean(v))} />
            <div className="flex-1 min-w-0">
              <div className={cn("font-medium", t.done && "line-through text-muted-foreground")}>{t.title}</div>
              <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
                <span>👤 {staffLabel(t.assignee) || t.assignee}</span>
                <span>•</span>
                <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                {t.recordId && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 text-primary"><Link2 className="size-3" />auto from {t.bucket}</span>
                  </>
                )}
              </div>
            </div>
            <Select value={t.status} onValueChange={(v) => updateStatus(t, v as TaskStatus)}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            {isAdmin && (
              <Button variant="ghost" size="icon" onClick={() => removeTask(t.id)}><Trash2 className="size-4 text-destructive" /></Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
