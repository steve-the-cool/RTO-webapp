import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Link2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { STAFF_USERS, staffLabel } from "@/lib/records";
import { loadTasks, createManualTask, setTaskDone, removeTask, type Task } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/tasks")({ component: TasksPage });

function TasksPage() {
  const session = getSession();
  const isAdmin = session?.role === "admin";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string>(session?.username ?? "staff");
  const [filter, setFilter] = useState<string>(isAdmin ? "all" : (session?.username ?? "staff"));

  useEffect(() => {
    setTasks(loadTasks());
    const handler = () => setTasks(loadTasks());
    window.addEventListener("tasks-change", handler);
    window.addEventListener("records-change", handler);
    return () => {
      window.removeEventListener("tasks-change", handler);
      window.removeEventListener("records-change", handler);
    };
  }, []);

  const visible = useMemo(() => {
    if (!isAdmin) return tasks.filter((t) => t.assignee === session?.username);
    if (filter === "all") return tasks;
    return tasks.filter((t) => t.assignee === filter);
  }, [tasks, isAdmin, filter, session?.username]);

  const pending = visible.filter((t) => !t.done).length;

  const add = () => {
    if (!title.trim()) return;
    createManualTask({ title: title.trim(), assignee, createdBy: session?.username ?? "system" });
    setTitle("");
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tasks</h2>
          <p className="text-sm text-muted-foreground">
            {pending} pending • {visible.length} total
            {isAdmin ? " • Admin view" : " • Your assigned tasks"}
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

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="text-sm font-semibold">{isAdmin ? "Assign new task" : "Add a personal task"}</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title…" onKeyDown={(e) => e.key === "Enter" && add()} />
          {isAdmin && (
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAFF_USERS.map((s) => <SelectItem key={s.username} value={s.username}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button onClick={add}><Plus className="size-4 mr-1" />Add</Button>
        </div>
      </div>

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
                <span>•</span>
                <span className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5",
                  t.status === "Completed" ? "border-success/40 text-success bg-success/10" :
                  t.status === "In Progress" ? "border-primary/40 text-primary bg-primary/10" :
                  "border-border text-muted-foreground",
                )}>{t.status}</span>
              </div>
            </div>
            {(isAdmin || t.manual) && (
              <Button variant="ghost" size="icon" onClick={() => removeTask(t.id)}><Trash2 className="size-4 text-destructive" /></Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
