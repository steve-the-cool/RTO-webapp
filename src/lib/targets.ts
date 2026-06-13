// Targets — Firestore-backed target management for various service categories.
import {
  collection,
  query,
  getDocs,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  arrayUnion,
} from "firebase/firestore";
import { db } from "./firebase";
import { createActivity, type ActivityLog } from "./activity";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TargetCategory =
  | "Insurance"
  | "Fitness"
  | "Permit"
  | "Gujarat Permit"
  | "National Permit"
  | "Tax"
  | "License"
  | "RC Transfer"
  | "HP Addition"
  | "HP Termination";

export interface Target {
  id: string;
  category: TargetCategory;
  target: number;
  completed: number;
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
  activityLogs?: ActivityLog[];
}

// ─── Calculated fields ────────────────────────────────────────────────────────

export interface TargetMetrics extends Target {
  remaining: number;
  achievementPercentage: number;
}

/**
 * Calculate metrics for a target.
 */
export function calculateTargetMetrics(target: Target): TargetMetrics {
  const remaining = Math.max(0, target.target - target.completed);
  const achievementPercentage = target.target > 0 ? (target.completed / target.target) * 100 : 0;

  return {
    ...target,
    remaining,
    achievementPercentage: Math.round(achievementPercentage * 100) / 100,
  };
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

const TARGETS_COLLECTION = "targets";

/**
 * Subscribe to all targets with live updates.
 * Returns an unsubscribe function for cleanup.
 */
export function subscribeToTargets(
  callback: (targets: TargetMetrics[]) => void,
): () => void {
  const q = query(collection(db, TARGETS_COLLECTION));

  const unsub = onSnapshot(q, (snapshot) => {
    const targets: TargetMetrics[] = snapshot.docs.map((doc) => {
      const data = doc.data() as Omit<Target, "id">;
      return calculateTargetMetrics({ ...data, id: doc.id });
    });

    // Sort by category for consistent display
    targets.sort((a, b) => a.category.localeCompare(b.category));

    callback(targets);
  });

  return unsub;
}

/**
 * Get a single target by category.
 */
export async function getTargetByCategory(category: TargetCategory): Promise<TargetMetrics | null> {
  const q = query(collection(db, TARGETS_COLLECTION));
  const snapshot = await getDocs(q);

  for (const doc of snapshot.docs) {
    const data = doc.data() as Omit<Target, "id">;
    if (data.category === category) {
      return calculateTargetMetrics({ ...data, id: doc.id });
    }
  }

  return null;
}

/**
 * Create or initialize a target.
 */
export async function createOrInitializeTarget(
  category: TargetCategory,
  targetValue: number,
  actor: string,
): Promise<void> {
  const existing = await getTargetByCategory(category);

  if (existing) {
    // Update existing
    const targetRef = doc(db, TARGETS_COLLECTION, existing.id);
    const activity = createActivity(actor, "Created", "target", `${existing.target}`, `${targetValue}`);

    await updateDoc(targetRef, {
      target: targetValue,
      lastUpdatedBy: actor,
      lastUpdatedAt: new Date().toISOString(),
      activityLogs: arrayUnion(activity),
    });
  } else {
    // Create new
    const targetRef = doc(collection(db, TARGETS_COLLECTION));
    const activity = createActivity(actor, "Created", "target", "0", `${targetValue}`);

    await setDoc(targetRef, {
      category,
      target: targetValue,
      completed: 0,
      lastUpdatedBy: actor,
      lastUpdatedAt: new Date().toISOString(),
      activityLogs: [activity],
    } as Target);
  }
}

/**
 * Update target value (admin only).
 */
export async function updateTargetValue(
  id: string,
  newTarget: number,
  actor: string,
): Promise<void> {
  const targetRef = doc(db, TARGETS_COLLECTION, id);
  const snapshot = await getDoc(targetRef);

  if (!snapshot.exists()) {
    throw new Error("Target not found");
  }

  const currentTarget = snapshot.data().target;
  const activity = createActivity(
    actor,
    "Updated",
    "target",
    `${currentTarget}`,
    `${newTarget}`,
  );

  await updateDoc(targetRef, {
    target: newTarget,
    lastUpdatedBy: actor,
    lastUpdatedAt: new Date().toISOString(),
    activityLogs: arrayUnion(activity),
  });
}

/**
 * Update completed count.
 */
export async function updateCompletedCount(
  id: string,
  newCompleted: number,
  actor: string,
): Promise<void> {
  const targetRef = doc(db, TARGETS_COLLECTION, id);
  const snapshot = await getDoc(targetRef);

  if (!snapshot.exists()) {
    throw new Error("Target not found");
  }

  const currentCompleted = snapshot.data().completed;
  const activity = createActivity(
    actor,
    "Updated",
    "completed",
    `${currentCompleted}`,
    `${newCompleted}`,
  );

  await updateDoc(targetRef, {
    completed: newCompleted,
    lastUpdatedBy: actor,
    lastUpdatedAt: new Date().toISOString(),
    activityLogs: arrayUnion(activity),
  });
}

/**
 * Increment completed count by 1.
 */
export async function incrementCompleted(
  id: string,
  actor: string,
): Promise<void> {
  const targetRef = doc(db, TARGETS_COLLECTION, id);
  const snapshot = await getDoc(targetRef);

  if (!snapshot.exists()) {
    throw new Error("Target not found");
  }

  const currentCompleted = snapshot.data().completed;
  const newCompleted = currentCompleted + 1;

  await updateCompletedCount(id, newCompleted, actor);
}
