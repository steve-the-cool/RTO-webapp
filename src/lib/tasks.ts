// Tasks — Firestore-backed task management.
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { saveRecord, type Bucket, type RegistryRecord, type DeleteReason } from "./records";
import { createActivity, type ActivityLog } from "./activity";

// ─── Re-exports ──────────────────────────────────────────────────────────────
export type { DeleteReason };

export type TaskStatus = "Assigned" | "Read" | "In Progress" | "Completed" | "On Hold";
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
  storageKey: string; // Firebase Storage path
  downloadUrl: string;
  addedAt: string;
  addedBy: string;
}

export interface TaskSubtask {
  id: string;
  title: string;
  completed: boolean;
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
  dueDate?: string;
  reminderMinutes?: number;
  associationType: AssociationType;
  recordId?: string;
  bucket?: Bucket;
  manual: boolean;
  readBy?: string;
  readAt?: string;
  acknowledged?: boolean;
  subtasks?: TaskSubtask[];
  progress?: number;
  comments?: TaskComment[];
  activity?: TaskActivity[];
  attachments?: TaskAttachment[];
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
  activityLogs?: ActivityLog[];
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: DeleteReason;
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

const COL = "registry_tasks";

function activityEntry(actor: string, message: string): TaskActivity {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), actor, message };
}

/**
 * Calculate task progress based on completed subtasks.
 */
export function calculateProgress(subtasks: TaskSubtask[]): number {
  if (!subtasks.length) return 0;
  const completed = subtasks.filter((s) => s.completed).length;
  return Math.round((completed / subtasks.length) * 100);
}

/**
 * Update subtasks and recalculate progress.
 * If all subtasks are completed, mark task as completed.
 */
export async function updateSubtasks(
  taskId: string,
  subtasks: TaskSubtask[],
  actor: string,
): Promise<void> {
  const progress = calculateProgress(subtasks);
  const isCompleted = progress === 100 && subtasks.length > 0;

  const entry = activityEntry(actor, "Updated subtasks");
  const actLog = createActivity(actor, "Updated subtasks");

  const now = new Date().toISOString();
  await updateDoc(doc(db, COL, taskId), {
    subtasks,
    progress,
    lastUpdatedBy: actor,
    lastUpdatedAt: now,
    ...(isCompleted ? { status: "Completed", done: true } : { done: false }),
    activity: arrayUnion(entry),
    activityLogs: arrayUnion(actLog),
  });
}

/**
 * Toggle a subtask's completion status and auto-update task progress.
 */
export async function toggleSubtask(
  taskId: string,
  subtaskId: string,
  actor: string,
): Promise<void> {
  // Fetch current task to get all subtasks
  const { getDoc } = await import("firebase/firestore");
  const taskDoc = await getDoc(doc(db, COL, taskId));
  if (!taskDoc.exists()) throw new Error("Task not found");

  const task = taskDoc.data() as Task;
  const subtasks = task.subtasks ?? [];
  const subtask = subtasks.find((s) => s.id === subtaskId);
  if (!subtask) throw new Error("Subtask not found");

  // Toggle completion
  subtask.completed = !subtask.completed;
  const wasCompleted = subtask.completed;

  // Recalculate progress
  const progress = calculateProgress(subtasks);
  const isCompleted = progress === 100 && subtasks.length > 0;

  // Determine activity message
  const message = wasCompleted ? `Completed subtask: ${subtask.title}` : `Reopened subtask: ${subtask.title}`;
  const entry = activityEntry(actor, message);
  const actLog = createActivity(actor, message, "subtask", "", subtask.title);

  // Update with new status logic
  const updates: any = {
    subtasks,
    progress,
    lastUpdatedBy: actor,
    lastUpdatedAt: new Date().toISOString(),
    activity: arrayUnion(entry),
    activityLogs: arrayUnion(actLog),
  };

  // Auto-complete task when all subtasks done
  if (isCompleted && !task.done) {
    updates.status = "Completed";
    updates.done = true;
  }
  // Mark as In Progress if any subtask becomes incomplete
  else if (!isCompleted && task.done) {
    updates.status = "In Progress";
    updates.done = false;
  } else if (!isCompleted && task.status === "Completed") {
    updates.status = "In Progress";
    updates.done = false;
  }

  await updateDoc(doc(db, COL, taskId), updates);
}

/**
 * Add a new subtask to a task.
 */
export async function addSubtask(
  taskId: string,
  title: string,
  actor: string,
): Promise<void> {
  const { getDoc } = await import("firebase/firestore");
  const taskDoc = await getDoc(doc(db, COL, taskId));
  if (!taskDoc.exists()) throw new Error("Task not found");

  const task = taskDoc.data() as Task;
  const subtasks = task.subtasks ?? [];

  const newSubtask: TaskSubtask = {
    id: crypto.randomUUID(),
    title,
    completed: false,
  };

  subtasks.push(newSubtask);

  const entry = activityEntry(actor, `Added subtask: ${title}`);
  const actLog = createActivity(actor, `Added subtask`, "subtask", "", title);

  const now = new Date().toISOString();
  await updateDoc(doc(db, COL, taskId), {
    subtasks,
    lastUpdatedBy: actor,
    lastUpdatedAt: now,
    activity: arrayUnion(entry),
    activityLogs: arrayUnion(actLog),
  });
}

/**
 * Reassign task to a different staff member.
 */
export async function reassignTask(
  taskId: string,
  newAssignee: string,
  actor: string,
): Promise<void> {
  const { getDoc } = await import("firebase/firestore");
  const taskDoc = await getDoc(doc(db, COL, taskId));
  if (!taskDoc.exists()) throw new Error("Task not found");

  const task = taskDoc.data() as Task;
  const prevAssignee = task.assignee;

  const message = actor === newAssignee
    ? `Task taken over by ${actor}`
    : `Task reassigned from ${prevAssignee} to ${newAssignee}`;

  const entry = activityEntry(actor, message);
  const actLog = createActivity(
    actor,
    message,
    "assignee",
    prevAssignee,
    newAssignee,
  );

  const now = new Date().toISOString();
  await updateDoc(doc(db, COL, taskId), {
    assignee: newAssignee,
    lastUpdatedBy: actor,
    lastUpdatedAt: now,
    activity: arrayUnion(entry),
    activityLogs: arrayUnion(actLog),
  });
}

/**
 * Mark a task as read by the current assignee.
 * Automatically called when the assignee opens the task for the first time.
 */
export async function markTaskAsRead(
  taskId: string,
  actor: string,
  userName: string, // Full name for display in activity log
): Promise<void> {
  const { getDoc } = await import("firebase/firestore");
  const taskDoc = await getDoc(doc(db, COL, taskId));
  if (!taskDoc.exists()) throw new Error("Task not found");

  const task = taskDoc.data() as Task;

  // Only mark as read if not already read
  if (task.readBy) return;

  const now = new Date().toISOString();
  const message = `Task viewed by ${userName}`;
  const entry = activityEntry(actor, message);
  const actLog = createActivity(actor, message, "read", "", userName);

  await updateDoc(doc(db, COL, taskId), {
    readBy: actor,
    readAt: now,
    status: "Read",
    lastUpdatedBy: actor,
    lastUpdatedAt: now,
    activity: arrayUnion(entry),
    activityLogs: arrayUnion(actLog),
  });
}

/**
 * Subscribe to live task updates.
 * Returns an unsubscribe function for useEffect cleanup.
 */
export function subscribeToTasks(cb: (tasks: Task[]) => void): () => void {
  const q = query(collection(db, COL), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const tasks = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Task))
      .filter((t) => !t.isDeleted); // Hide soft-deleted tasks
    cb(tasks);
  });
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

export async function createManualTask(input: CreateTaskInput): Promise<Task> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const initActivity = createActivity(input.createdBy, "Task created");
  const task: Task = {
    id,
    title: input.title,
    description: input.description ?? "",
    assignee: input.assignee,
    status: "Assigned",
    priority: input.priority,
    done: false,
    createdAt: now,
    createdBy: input.createdBy,
    dueDate: input.dueDate,
    reminderMinutes: input.reminderMinutes,
    associationType: input.associationType,
    bucket: input.bucket,
    recordId: input.recordId,
    manual: true,
    subtasks: [],
    progress: 0,
    comments: [],
    attachments: [],
    activity: [activityEntry(input.createdBy, "Task created")],
    lastUpdatedBy: input.createdBy,
    lastUpdatedAt: now,
    activityLogs: [initActivity],
  };
  const { id: _id, ...data } = task;
  await setDoc(doc(db, COL, id), data);
  return task;
}

export async function updateTask(
  taskId: string,
  patch: Partial<Task>,
  actor: string,
  note?: string,
): Promise<void> {
  const { getDoc } = await import("firebase/firestore");
  const taskDoc = await getDoc(doc(db, COL, taskId));
  if (!taskDoc.exists()) throw new Error("Task not found");

  const existing = taskDoc.data() as Task;

  // Track important field changes
  const tracked = ["status", "priority", "assignee"];
  const activities: ActivityLog[] = [];

  for (const field of tracked) {
    const oldVal = (existing as any)[field];
    const newVal = (patch as any)[field];
    if (newVal !== undefined && oldVal !== newVal) {
      activities.push(
        createActivity(
          actor,
          `Updated ${field}`,
          field,
          String(oldVal ?? "—"),
          String(newVal),
        ),
      );
    }
  }

  // Create main activity entry if note provided
  const mainEntry = activityEntry(actor, note ?? "Task updated");

  const now = new Date().toISOString();
  await updateDoc(doc(db, COL, taskId), {
    ...patch,
    lastUpdatedBy: actor,
    lastUpdatedAt: now,
    activity: arrayUnion(mainEntry),
    activityLogs: arrayUnion(...activities),
  });
}

export async function setTaskDone(taskId: string, done: boolean, actor = "system"): Promise<void> {
  const entry = activityEntry(actor, done ? "Marked complete" : "Reopened");
  const actLog = createActivity(actor, done ? "Marked complete" : "Reopened", "status", done ? "Pending" : "Completed", done ? "Completed" : "Pending");
  
  const now = new Date().toISOString();
  await updateDoc(doc(db, COL, taskId), {
    done,
    status: done ? "Completed" : "Pending",
    lastUpdatedBy: actor,
    lastUpdatedAt: now,
    activity: arrayUnion(entry),
    activityLogs: arrayUnion(actLog),
  });
}

export async function addComment(taskId: string, author: string, text: string): Promise<void> {
  const comment: TaskComment = {
    id: crypto.randomUUID(),
    author,
    text,
    at: new Date().toISOString(),
  };
  const entry = activityEntry(author, "Added comment");
  const actLog = createActivity(author, "Added comment", "comment", "", text);
  
  const now = new Date().toISOString();
  await updateDoc(doc(db, COL, taskId), {
    comments: arrayUnion(comment),
    lastUpdatedBy: author,
    lastUpdatedAt: now,
    activity: arrayUnion(entry),
    activityLogs: arrayUnion(actLog),
  });
}

export async function addAttachment(taskId: string, file: TaskAttachment): Promise<void> {
  const entry = activityEntry(file.addedBy, `Attached ${file.name}`);
  const actLog = createActivity(file.addedBy, "Added attachment", "attachment", "", file.name);
  
  const now = new Date().toISOString();
  await updateDoc(doc(db, COL, taskId), {
    attachments: arrayUnion(file),
    lastUpdatedBy: file.addedBy,
    lastUpdatedAt: now,
    activity: arrayUnion(entry),
    activityLogs: arrayUnion(actLog),
  });
}

export async function removeTask(taskId: string): Promise<void> {
  await deleteDoc(doc(db, COL, taskId));
}

/** Soft-delete a task (admin only). */
export async function softDeleteTask(
  taskId: string,
  actor: string,
  reason: DeleteReason,
): Promise<void> {
  const now = new Date().toISOString();
  const deleteLog = createActivity(
    actor,
    "Task deleted",
    "deleteReason",
    "",
    reason,
  );

  await updateDoc(doc(db, COL, taskId), {
    isDeleted: true,
    deletedAt: now,
    deletedBy: actor,
    deleteReason: reason,
    activityLogs: arrayUnion(deleteLog),
  });
}

/** Auto-sync a task from a record save — creates or updates the linked task. */
export async function syncTaskFromRecord(
  bucket: Bucket,
  record: RegistryRecord,
  actor: string,
): Promise<void> {
  // We need to find the linked task by recordId. Use a separate query.
  const { collection: col, query: q, where, getDocs } = await import("firebase/firestore");
  const snap = await getDocs(q(col(db, COL), where("recordId", "==", record.id)));

  const label = bucket === "clients" ? "Client" : bucket === "leads" ? "Lead" : "Customer";
  const title = `${label}: ${record.name || record.mvNo || `SR ${record.srNo}`} — ${record.work || record.application || "follow up"}`;
  const mappedStatus: TaskStatus =
    record.status === "Completed"
      ? "Completed"
      : record.status === "In Progress"
        ? "In Progress"
        : record.status === "On Hold"
          ? "On Hold"
          : "Assigned";

  if (!snap.empty) {
    // Update existing linked task
    const taskDoc = snap.docs[0];
    const entry = activityEntry(actor, `Auto-synced from ${bucket}`);
    await updateDoc(taskDoc.ref, {
      title,
      status: mappedStatus,
      done: record.status === "Completed",
      ...(record.assignee ? { assignee: record.assignee } : {}),
      activity: arrayUnion(entry),
    });
  } else if (record.assignee) {
    // Create a new linked task
    const id = crypto.randomUUID();
    const task: Task = {
      id,
      title,
      description: record.work || record.application || "",
      assignee: record.assignee,
      status: mappedStatus,
      priority: "Medium",
      done: record.status === "Completed",
      createdAt: new Date().toISOString(),
      createdBy: actor,
      associationType: bucket === "leads" ? "lead" : "client",
      recordId: record.id,
      bucket,
      manual: false,
      subtasks: [],
      progress: 0,
      comments: [],
      attachments: [],
      activity: [activityEntry(actor, `Created from ${bucket}`)],
    };
    const { id: _id, ...data } = task;
    await setDoc(doc(db, COL, id), data);
  }
}

// ─── Legacy stubs ─────────────────────────────────────────────────────────────

/** @deprecated Use subscribeToTasks(). */
export function loadTasks(): Task[] {
  return [];
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const PRIORITY_OPTIONS: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];
export const TASK_STATUS_OPTIONS: TaskStatus[] = [
  "Assigned",
  "Read",
  "In Progress",
  "Completed",
  "On Hold",
];
