// Mock staff auth backed by localStorage. Replace with real auth when ready.
const KEY = "registry-staff-session";

export type StaffUser = { username: string; name: string; role: "admin" | "staff" };

const STAFF: Record<string, { password: string; user: StaffUser }> = {
  admin: { password: "admin123", user: { username: "admin", name: "Office Admin", role: "admin" } },
  staff: { password: "staff123", user: { username: "staff", name: "Front Desk", role: "staff" } },
};

export function getSession(): StaffUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as StaffUser; } catch { return null; }
}

export function login(username: string, password: string): StaffUser {
  const entry = STAFF[username.trim().toLowerCase()];
  if (!entry || entry.password !== password) throw new Error("Invalid credentials");
  localStorage.setItem(KEY, JSON.stringify(entry.user));
  window.dispatchEvent(new Event("auth-change"));
  return entry.user;
}

export function logout() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("auth-change"));
}
