// Task model with auto-sync from linked records.
import { loadRecords, saveRecords, type Bucket, type RegistryRecord } from "./records";

export type TaskStatus = "Pending" | "In Progress" | "Completed" | "On Hold";
export type TaskPriority = "Low" | "Medium" | "High" | "Urgent";
export type AssociationType = "client" | "lead" | "none";

export interface TaskComment {
  id: string;
  author: string;
  text: string;
  at: string;
}

export interface TaskActivity {
  id: string;
  at: string;
  actor: string;
  message: string;
}

export interface TaskAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string; // small files only (kept in localStorage)
  addedAt: string;
  addedBy: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  assignee: string;
  status: TaskStatus;
  priority: TaskPriority;
  done: boolean;
  createdAt: string;
  createdBy: string;
  dueDate?: string; // ISO datetime
  reminderMinutes?: number; // minutes before dueDate
  associationType: AssociationType;
  recordId?: string;
  bucket?: Bucket;
  manual: boolean;
  comments?: TaskComment[];
  activity?: TaskActivity[];
  attachments?: TaskAttachment[];
}

const KEY = "registry-tasks-v2";
const LEGACY_KEY = "registry-tasks";

function migrate(raw: any[]): Task[] {
  return raw.map((t) => ({
    description: "",
    priority: "Medium" as TaskPriority,
    associationType: t.recordId ? (t.bucket === "leads" ? "lead" : "client") : "none",
    comments: [],
    activity: [],
    attachments: [],
    ...t,
    status: t.status === "On Hold" ? "On Hold" : t.status,
  })) as Task[];
}

export function loadTasks(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const v2 = localStorage.getItem(KEY);
    if (v2) return JSON.parse(v2) as Task[];
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = migrate(JSON.parse(legacy));
      localStorage.setItem(KEY, JSON.stringify(migrated));
      return migrated;
    }
    return [];
  } catch { return []; }
}

export function saveTasks(tasks: Task[]) {
  localStorage.setItem(KEY, JSON.stringify(tasks));
  window.dispatchEvent(new Event("tasks-change"));
}

function recordTitle(bucket: Bucket, r: RegistryRecord) {
  const label = bucket === "clients" ? "Client" : bucket === "leads" ? "Lead" : "Customer";
  return `${label}: ${r.name || r.mvNo || `SR ${r.srNo}`} — ${r.work || r.application || "follow up"}`;
}

function pushActivity(task: Task, actor: string, message: string): Task {
  const activity = task.activity ?? [];
  return {
    ...task,
    activity: [{ id: crypto.randomUUID(), at: new Date().toISOString(), actor, message }, ...activity],
  };
}

/** Sync from a record update — create or update the linked task. */
export function syncTaskFromRecord(bucket: Bucket, record: RegistryRecord, actor: string) {
  const tasks = loadTasks();
  const existing = tasks.find((t) => t.recordId === record.id);
  const title = recordTitle(bucket, record);
  const recordCompleted = record.status === "Completed";
  const mappedStatus: TaskStatus =
    recordCompleted ? "Completed" :
    record.status === "In Progress" ? "In Progress" :
    record.status === "On Hold" ? "On Hold" : "Pending";

  if (!record.assignee) {
    if (existing) {
      const next = tasks.map((t) => t.id === existing.id
        ? pushActivity({ ...t, title, status: mappedStatus, done: recordCompleted || t.done }, actor, `Auto-synced from ${bucket}`)
        : t);
      saveTasks(next);
    }
    return;
  }

  if (existing) {
    const next = tasks.map((t) => t.id === existing.id
      ? pushActivity({ ...t, title, assignee: record.assignee!, status: mappedStatus, done: recordCompleted || t.done }, actor, `Auto-synced from ${bucket}`)
      : t);
    saveTasks(next);
  } else {
    const task: Task = {
      id: crypto.randomUUID(),
      title,
      description: record.work || record.application || "",
      assignee: record.assignee,
      status: mappedStatus,
      priority: "Medium",
      done: recordCompleted,
      createdAt: new Date().toISOString(),
      createdBy: actor,
      associationType: bucket === "leads" ? "lead" : "client",
      recordId: record.id,
      bucket,
      manual: false,
      comments: [],
      attachments: [],
      activity: [{ id: crypto.randomUUID(), at: new Date().toISOString(), actor, message: `Created from ${bucket}` }],
    };
    saveTasks([task, ...tasks]);
  }
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  assignee: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  reminderMinutes?: number;
  associationType: AssociationType;
  bucket?: Bucket;
  recordId?: string;
  createdBy: string;
}

export function createManualTask(input: CreateTaskInput): Task {
  const tasks = loadTasks();
  const task: Task = {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description ?? "",
    assignee: input.assignee,
    status: input.status,
    priority: input.priority,
    done: input.status === "Completed",
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    dueDate: input.dueDate,
    reminderMinutes: input.reminderMinutes,
    associationType: input.associationType,
    bucket: input.bucket,
    recordId: input.recordId,
    manual: true,
    comments: [],
    attachments: [],
    activity: [{ id: crypto.randomUUID(), at: new Date().toISOString(), actor: input.createdBy, message: "Task created" }],
  };
  saveTasks([task, ...tasks]);
  return task;
}

export function updateTask(taskId: string, patch: Partial<Task>, actor: string, note?: string) {
  const tasks = loadTasks();
  const next = tasks.map((t) => {
    if (t.id !== taskId) return t;
    const updated = { ...t, ...patch };
    return pushActivity(updated, actor, note ?? "Task updated");
  });
  saveTasks(next);
}

export function setTaskDone(taskId: string, done: boolean, actor = "system") {
  const tasks = loadTasks();
  const t = tasks.find((x) => x.id === taskId);
  if (!t) return;
  const next = tasks.map((x) => x.id === taskId
    ? pushActivity({ ...x, done, status: (done ? "Completed" : "Pending") as TaskStatus }, actor, done ? "Marked complete" : "Reopened")
    : x);
  saveTasks(next);

  if (t.recordId && t.bucket) {
    const records = loadRecords(t.bucket);
    const updated = records.map((r) =>
      r.id === t.recordId ? { ...r, status: (done ? "Completed" : "In Progress") as RegistryRecord["status"] } : r,
    );
    saveRecords(t.bucket, updated);
  }
}

export function addComment(taskId: string, author: string, text: string) {
  const tasks = loadTasks();
  const next = tasks.map((t) => {
    if (t.id !== taskId) return t;
    const comments = [...(t.comments ?? []), { id: crypto.randomUUID(), author, text, at: new Date().toISOString() }];
    return pushActivity({ ...t, comments }, author, "Added comment");
  });
  saveTasks(next);
}

export function addAttachment(taskId: string, file: TaskAttachment) {
  const tasks = loadTasks();
  const next = tasks.map((t) => {
    if (t.id !== taskId) return t;
    const attachments = [...(t.attachments ?? []), file];
    return pushActivity({ ...t, attachments }, file.addedBy, `Attached ${file.name}`);
  });
  saveTasks(next);
}

export function removeTask(taskId: string) {
  saveTasks(loadTasks().filter((t) => t.id !== taskId));
}

export const PRIORITY_OPTIONS: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];
export const TASK_STATUS_OPTIONS: TaskStatus[] = ["Pending", "In Progress", "Completed", "On Hold"];
