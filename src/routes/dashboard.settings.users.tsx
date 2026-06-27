// src/routes/dashboard.settings.users.tsx
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminPinModal } from "@/components/AdminPinModal";
import {
  fetchAllUsers,
  createUser,
  updateUser,
  deleteUser,
  setUserStatus,
  resetPassword,
} from "@/lib/userService";
import { withRoleGuard } from "@/lib/withRoleGuard";
import { getSession } from "@/lib/auth";

export const Route = createFileRoute("/dashboard/settings/users")({
  component: UsersPage,
});

function UsersPage() {
  const [users, setUsers] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const list = await fetchAllUsers();
    setUsers(list);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  // Guard: only admin role may view this page
  const session = getSession();
  if (!session || session.role !== "admin") {
    // redirect to settings or show message
    return <Navigate to="/dashboard/settings" replace />;
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    const username = data.get("username") as string;
    const name = data.get("name") as string;
    const role = data.get("role") as "admin" | "manager" | "employee" | "viewer";
    const password = Math.random().toString(36).slice(-8);
    try {
      await createUser({ username, name, role, password, createdBy: session.username });
      await refresh();
      setShowAdd(false);
    } catch (err) {
      console.error(err);
      alert("Failed to create user");
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    const name = data.get("name") as string;
    const role = data.get("role") as "admin" | "manager" | "employee" | "viewer";
    if (!editUser) return;
    try {
      await updateUser(editUser.uid, { name, role }, session.username);
      await refresh();
      setEditUser(null);
    } catch (err) {
      console.error(err);
      alert("Failed to update user");
    }
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    try {
      await deleteUser(userToDelete, session.username);
      await refresh();
    } catch (err) {
      console.error(err);
      alert("Deletion failed");
    } finally {
      setUserToDelete(null);
    }
  };

  const handleStatusChange = async (uid: string, newStatus: "active" | "inactive" | "suspended") => {
    try {
      await setUserStatus(uid, newStatus, session.username);
      await refresh();
    } catch (err) {
      console.error(err);
      alert("Status update failed");
    }
  };

  const handleResetPassword = async (uid: string) => {
    const newPass = Math.random().toString(36).slice(-8);
    try {
      await resetPassword(uid, newPass, session.username);
      alert(`Password reset to: ${newPass}`);
    } catch (err) {
      console.error(err);
      alert("Password reset failed");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <h2 className="text-2xl font-bold">User Management</h2>
      <Button variant="outline" onClick={() => setShowAdd(true)}>
        Add User
      </Button>

      {/* Add User Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-sm font-medium">Username</label>
              <Input name="username" required />
            </div>
            <div>
              <label className="block text-sm font-medium">Full Name</label>
              <Input name="name" required />
            </div>
            <div>
              <label className="block text-sm font-medium">Role</label>
              <Select name="role" defaultValue="employee">
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          {editUser && (
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium">Username (locked)</label>
                <Input value={editUser.username} disabled />
              </div>
              <div>
                <label className="block text-sm font-medium">Full Name</label>
                <Input name="name" defaultValue={editUser.name} required />
              </div>
              <div>
                <label className="block text-sm font-medium">Role</label>
                <Select name="role" defaultValue={editUser.role}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Admin PIN modal for deletion */}
      <AdminPinModal
        open={pinModalOpen}
        onOpenChange={setPinModalOpen}
        onSuccess={confirmDelete}
      />

      {loading ? (
        <p>Loading users…</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="p-2 text-left">Username</th>
              <th className="p-2 text-left">Full Name</th>
              <th className="p-2 text-left">Role</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.uid} className="border-b">
                <td className="p-2">{u.username}</td>
                <td className="p-2">{u.name || u.fullName}</td>
                <td className="p-2">{u.role}</td>
                <td className="p-2 capitalize">{u.status}</td>
                <td className="p-2 space-x-2">
                  <Button variant="outline" size="sm" onClick={() => setEditUser(u)}>
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUserToDelete(u.uid);
                      setPinModalOpen(true);
                    }}
                  >
                    Delete
                  </Button>
                  {u.status !== "active" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleStatusChange(u.uid, "active")}
                    >
                      Activate
                    </Button>
                  )}
                  {u.status === "active" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleStatusChange(u.uid, "inactive")}
                    >
                      Deactivate
                    </Button>
                  )}
                  {u.status !== "suspended" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleStatusChange(u.uid, "suspended")}
                    >
                      Suspend
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleResetPassword(u.uid)}>
                    Reset PW
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RedirectToSettings() {
  // tanstack router redirect helper
  redirect({ from: "/dashboard/settings/users", to: "/dashboard/settings" });
  return null;
}
