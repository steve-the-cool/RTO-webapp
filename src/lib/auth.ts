// Auth — Firebase Auth + Firestore user profiles.
// Maintains the same public API as the old localStorage auth so routes
// don't need major changes.
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { STAFF_USERS } from "./records";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StaffUser = {
  uid: string;
  username: string;
  name: string;
  role: "admin" | "staff";
};

// ─── In-memory session cache ──────────────────────────────────────────────────
// Populated by initAuth() so getSession() stays synchronous (needed by
// beforeLoad guards in routes).

let _session: StaffUser | null = null;
let _initialized = false;

const EMAIL_DOMAIN = "staff-focus-hub.app";
const toEmail = (username: string) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

// ─── Staff account definitions ────────────────────────────────────────────────

const ALL_ACCOUNTS = [
  { username: "admin", password: "admin123", name: "Office Admin", role: "admin" as const },
  ...STAFF_USERS.map((s) => ({
    username: s.username,
    password: `${s.username}123`,
    name: s.name,
    role: "staff" as const,
  })),
];

export const STAFF_CREDENTIALS = ALL_ACCOUNTS.map((a) => ({
  username: a.username,
  name: a.name,
  password: a.password,
}));

// ─── First-run provisioning ───────────────────────────────────────────────────

async function provisionUsers(): Promise<void> {
  // Check whether we've already provisioned
  const metaRef = doc(db, "_meta", "provisioned");
  const metaSnap = await getDoc(metaRef);
  if (metaSnap.exists()) return;

  // Create Firebase Auth accounts and Firestore profiles
  for (const acct of ALL_ACCOUNTS) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, toEmail(acct.username), acct.password);
      await setDoc(doc(db, "users", cred.user.uid), {
        username: acct.username,
        name: acct.name,
        role: acct.role,
      });
    } catch {
      // auth/email-already-in-use → already provisioned, skip
    }
  }

  // Seed initial Firestore records
  const { seedInitialData } = await import("./seed");
  await seedInitialData();

  // Mark as provisioned
  await setDoc(metaRef, { provisionedAt: new Date().toISOString() });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Bootstrap Firebase auth state.  Call once in the root component.
 * The callback fires every time the signed-in user changes.
 * Returns an unsubscribe function for cleanup.
 */
export function initAuth(onChange: (user: StaffUser | null) => void): () => void {
  // Kick off provisioning in the background (no-op if already done)
  provisionUsers().catch(console.error);

  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const snap = await getDoc(doc(db, "users", firebaseUser.uid));
      _session = snap.exists()
        ? ({ uid: firebaseUser.uid, ...snap.data() } as StaffUser)
        : null;
    } else {
      _session = null;
    }
    _initialized = true;
    // Keep a lightweight session in localStorage for immediate restores
    try {
      if (_session) {
        localStorage.setItem("rp_session", JSON.stringify({ uid: _session.uid, username: _session.username, name: _session.name, role: _session.role }));
      } else {
        localStorage.removeItem("rp_session");
      }
    } catch {
      // ignore storage errors
    }
    onChange(_session);
  });
}

/** Synchronous getter — populated after initAuth fires. */
export function getSession(): StaffUser | null {
  if (_session) return _session;
  // Try to restore lightweight session from localStorage to avoid redirect loops
  try {
    const raw = localStorage.getItem("rp_session");
    if (raw) {
      const parsed = JSON.parse(raw);
      // Minimal validation
      if (parsed && parsed.username) {
        return parsed as StaffUser;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/** True once the first onAuthStateChanged callback has fired. */
export function isAuthReady(): boolean {
  return _initialized;
}

/** Sign in by username + password (maps to Firebase email internally). */
export async function login(username: string, password: string): Promise<StaffUser> {
  const cred = await signInWithEmailAndPassword(auth, toEmail(username), password);
  const snap = await getDoc(doc(db, "users", cred.user.uid));
  if (!snap.exists()) throw new Error("User profile not found — contact admin.");
  _session = { uid: cred.user.uid, ...snap.data() } as StaffUser;
  try {
    localStorage.setItem("rp_session", JSON.stringify({ uid: _session.uid, username: _session.username, name: _session.name, role: _session.role }));
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event("auth-change"));
  return _session;
}

/** Sign out the current user. */
export async function logout(): Promise<void> {
  await signOut(auth);
  _session = null;
  try { localStorage.removeItem("rp_session"); } catch {}
  window.dispatchEvent(new Event("auth-change"));
}
