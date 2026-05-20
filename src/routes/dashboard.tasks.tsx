import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus } from "lucide-react";

interface Task { id: string; title: string; done: boolean; createdAt: string; }
const KEY = "registry-tasks";

const load = (): Task[] => {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
};

export const Route = createFileRoute("/dashboard/tasks")({
  component: TasksPage,
});

function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");

  useEffect(() => { setTasks(load()); }, []);
  const persist = (t: Task[]) => { setTasks(t); localStorage.setItem(KEY, JSON.stringify(t)); };

  const add = () => {
    if (!title.trim()) return;
    persist([{ id: crypto.randomUUID(), title: title.trim(), done: false, createdAt: new Date().toISOString() }, ...tasks]);
    setTitle("");
  };
  const toggle = (id: string) => persist(tasks.map((t) => t.id === id ? { ...t, done: !t.done } : t));
  const remove = (id: string) => persist(tasks.filter((t) => t.id !== id));

  const pending = tasks.filter((t) => !t.done).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Tasks</h2>
        <p className="text-sm text-muted-foreground">{pending} pending • {tasks.length} total</p>
      </div>

      <div className="flex gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a new task…" onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button onClick={add}><Plus className="size-4 mr-1" />Add</Button>
      </div>

      <div className="rounded-xl border bg-card divide-y">
        {tasks.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">No tasks yet.</div>}
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3">
            <Checkbox checked={t.done} onCheckedChange={() => toggle(t.id)} />
            <div className="flex-1">
              <div className={t.done ? "line-through text-muted-foreground" : ""}>{t.title}</div>
              <div className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="size-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
