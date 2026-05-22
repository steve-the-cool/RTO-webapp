// Mock staff auth backed by localStorage. Replace with real auth when ready.
import { STAFF_USERS } from "./records";

const KEY = "registry-staff-session";

export type StaffUser = { username: string; name: string; role: "admin" | "staff" };

type Entry = { password: string; user: StaffUser };

// Admin account
const ACCOUNTS: Record<string, Entry> = {
  admin: { password: "admin123", user: { username: "admin", name: "Office Admin", role: "admin" } },
};

// Default passwords for each staff member (username -> password)
const STAFF_PASSWORDS: Record<string, string> = {
  staff: "staff123",
  priya: "priya123",
  rahul: "rahul123",
};

// Auto-register every staff user from records.ts so admin-assigned tasks
// always have a matching login.
for (const s of STAFF_USERS) {
  ACCOUNTS[s.username] = {
    password: STAFF_PASSWORDS[s.username] ?? `${s.username}123`,
    user: { username: s.username, name: s.name, role: "staff" },
  };
}

export const STAFF_CREDENTIALS = STAFF_USERS.map((s) => ({
  username: s.username,
  name: s.name,
  password: ACCOUNTS[s.username].password,
}));

export function getSession(): StaffUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as StaffUser; } catch { return null; }
}

export function login(username: string, password: string): StaffUser {
  const entry = ACCOUNTS[username.trim().toLowerCase()];
  if (!entry || entry.password !== password) throw new Error("Invalid credentials");
  localStorage.setItem(KEY, JSON.stringify(entry.user));
  window.dispatchEvent(new Event("auth-change"));
  return entry.user;
}

export function logout() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("auth-change"));
}
