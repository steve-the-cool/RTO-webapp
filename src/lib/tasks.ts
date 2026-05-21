// Task model with auto-sync from linked records.
import { loadRecords, saveRecords, type Bucket, type RegistryRecord } from "./records";

export type TaskStatus = "Pending" | "In Progress" | "Completed";

export interface Task {
  id: string;
  title: string;
  assignee: string; // staff username
  status: TaskStatus;
  done: boolean;
  createdAt: string;
  createdBy: string;
  recordId?: string;
  bucket?: Bucket;
  manual: boolean;
}

const KEY = "registry-tasks";

export function loadTasks(): Task[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as Task[]; } catch { return []; }
}

export function saveTasks(tasks: Task[]) {
  localStorage.setItem(KEY, JSON.stringify(tasks));
  window.dispatchEvent(new Event("tasks-change"));
}

function recordTitle(bucket: Bucket, r: RegistryRecord) {
  const label = bucket === "clients" ? "Client" : bucket === "leads" ? "Lead" : "Customer";
  return `${label}: ${r.name || r.mvNo || `SR ${r.srNo}`} — ${r.work || r.application || "follow up"}`;
}

/** Called whenever a record is created or updated. Creates / updates / completes the linked task. */
export function syncTaskFromRecord(bucket: Bucket, record: RegistryRecord, actor: string) {
  const tasks = loadTasks();
  const existing = tasks.find((t) => t.recordId === record.id);
  const title = recordTitle(bucket, record);

  // Map record status → task status
  const recordCompleted = record.status === "Completed";
  const mappedStatus: TaskStatus = recordCompleted ? "Completed" : record.status === "In Progress" ? "In Progress" : "Pending";

  if (!record.assignee) {
    // no assignee → if a linked task exists, leave it but don't reassign
    if (existing) {
      const next = tasks.map((t) => t.id === existing.id ? { ...t, title, status: mappedStatus, done: recordCompleted || t.done } : t);
      saveTasks(next);
    }
    return;
  }

  if (existing) {
    const next = tasks.map((t) =>
      t.id === existing.id
        ? { ...t, title, assignee: record.assignee!, status: mappedStatus, done: recordCompleted || t.done }
        : t,
    );
    saveTasks(next);
  } else {
    const task: Task = {
      id: crypto.randomUUID(),
      title,
      assignee: record.assignee,
      status: mappedStatus,
      done: recordCompleted,
      createdAt: new Date().toISOString(),
      createdBy: actor,
      recordId: record.id,
      bucket,
      manual: false,
    };
    saveTasks([task, ...tasks]);
  }
}

/** Manual task creation (admin or staff). */
export function createManualTask(input: { title: string; assignee: string; createdBy: string }): Task {
  const tasks = loadTasks();
  const task: Task = {
    id: crypto.randomUUID(),
    title: input.title,
    assignee: input.assignee,
    status: "Pending",
    done: false,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    manual: true,
  };
  saveTasks([task, ...tasks]);
  return task;
}

/** Toggling a task done state. If linked to a record, also flips the record status to Completed/Pending. */
export function setTaskDone(taskId: string, done: boolean) {
  const tasks = loadTasks();
  const t = tasks.find((x) => x.id === taskId);
  if (!t) return;
  const next = tasks.map((x) => x.id === taskId ? { ...x, done, status: (done ? "Completed" : "Pending") as TaskStatus } : x);
  saveTasks(next);

  if (t.recordId && t.bucket) {
    const records = loadRecords(t.bucket);
    const updated = records.map((r) =>
      r.id === t.recordId ? { ...r, status: (done ? "Completed" : "In Progress") as RegistryRecord["status"] } : r,
    );
    saveRecords(t.bucket, updated);
  }
}

export function removeTask(taskId: string) {
  saveTasks(loadTasks().filter((t) => t.id !== taskId));
}
