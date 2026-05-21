import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import {
  loadRecords,
  saveRecords,
  emptyRecord,
  STATUS_OPTIONS,
  STAFF_USERS,
  staffLabel,
  type Bucket,
  type RegistryRecord,
  type RecordStatus,
} from "@/lib/records";
import { syncTaskFromRecord } from "@/lib/tasks";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  bucket: Bucket;
  title: string;
  description: string;
}

const COLS: { key: keyof RegistryRecord; label: string }[] = [
  { key: "srNo", label: "SR NO" },
  { key: "date", label: "DATE" },
  { key: "mvNo", label: "MV NO" },
  { key: "application", label: "APPLICATION" },
  { key: "work", label: "WORK" },
  { key: "name", label: "NAME" },
  { key: "status", label: "STATUS" },
  { key: "mo", label: "MO" },
  { key: "insurance", label: "INSURANCE" },
  { key: "fitness", label: "FITNESS" },
  { key: "tax", label: "TAX" },
  { key: "co", label: "C/O" },
];

function statusClass(status: RecordStatus) {
  switch (status) {
    case "Completed": return "bg-success/15 text-success border-success/30";
    case "In Progress": return "bg-primary/15 text-primary border-primary/30";
    case "On Hold": return "bg-warning/20 text-warning-foreground border-warning/40";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

export function RecordTable({ bucket, title, description }: Props) {
  const [records, setRecords] = useState<RegistryRecord[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<RegistryRecord | null>(null);
  const [open, setOpen] = useState(false);
  const session = getSession();
  const isAdmin = session?.role === "admin";

  useEffect(() => {
    setRecords(loadRecords(bucket));
    const handler = () => setRecords(loadRecords(bucket));
    window.addEventListener("records-change", handler);
    return () => window.removeEventListener("records-change", handler);
  }, [bucket]);

  const filtered = useMemo(() => {
    if (!query) return records;
    const q = query.toLowerCase();
    return records.filter((r) =>
      [r.mvNo, r.application, r.work, r.name, r.mo, r.co].some((v) => v.toLowerCase().includes(q)),
    );
  }, [records, query]);

  const persist = (next: RegistryRecord[]) => {
    setRecords(next);
    saveRecords(bucket, next);
  };

  const openNew = () => {
    const nextSr = records.length ? Math.max(...records.map((r) => r.srNo)) + 1 : 1;
    setEditing(emptyRecord(nextSr));
    setOpen(true);
  };

  const openEdit = (r: RegistryRecord) => {
    setEditing({ ...r });
    setOpen(true);
  };

  const remove = (id: string) => {
    if (!confirm("Delete this record?")) return;
    persist(records.filter((r) => r.id !== id));
  };

  const save = () => {
    if (!editing) return;
    const exists = records.some((r) => r.id === editing.id);
    persist(exists ? records.map((r) => (r.id === editing.id ? editing : r)) : [...records, editing]);
    syncTaskFromRecord(bucket, editing, session?.username ?? "system");
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="pl-8" />
          </div>
          <Button onClick={openNew}><Plus className="size-4 mr-1" />Add</Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {COLS.map((c) => (
                  <th key={c.key} className="text-left font-semibold px-3 py-3 whitespace-nowrap">{c.label}</th>
                ))}
                <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">ASSIGNEE</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={COLS.length + 2} className="px-3 py-12 text-center text-muted-foreground">No records yet.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-3 font-medium">{r.srNo}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-3 font-mono text-xs">{r.mvNo || "—"}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{r.application || "—"}</td>
                  <td className="px-3 py-3">{r.work || "—"}</td>
                  <td className="px-3 py-3 font-medium">{r.name || "—"}</td>
                  <td className="px-3 py-3">
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", statusClass(r.status))}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{r.mo || "—"}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{r.insurance || "—"}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{r.fitness || "—"}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{r.tax || "—"}</td>
                  <td className="px-3 py-3">{r.co || "—"}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs">{staffLabel(r.assignee) || <span className="text-muted-foreground">Unassigned</span>}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="size-4 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing && records.some((r) => r.id === editing.id) ? "Edit record" : "New record"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="SR NO"><Input type="number" value={editing.srNo} onChange={(e) => setEditing({ ...editing, srNo: Number(e.target.value) })} /></Field>
              <Field label="DATE"><Input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} /></Field>
              <Field label="MV NO"><Input value={editing.mvNo} onChange={(e) => setEditing({ ...editing, mvNo: e.target.value })} /></Field>
              <Field label="APPLICATION"><Input value={editing.application} onChange={(e) => setEditing({ ...editing, application: e.target.value })} /></Field>
              <Field label="WORK" full><Input value={editing.work} onChange={(e) => setEditing({ ...editing, work: e.target.value })} /></Field>
              <Field label="NAME"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label="STATUS">
                <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v as RecordStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="MO"><Input value={editing.mo} onChange={(e) => setEditing({ ...editing, mo: e.target.value })} /></Field>
              <Field label="INSURANCE"><Input value={editing.insurance} onChange={(e) => setEditing({ ...editing, insurance: e.target.value })} placeholder="Expiry / status" /></Field>
              <Field label="FITNESS"><Input value={editing.fitness} onChange={(e) => setEditing({ ...editing, fitness: e.target.value })} placeholder="Expiry / status" /></Field>
              <Field label="TAX"><Input value={editing.tax} onChange={(e) => setEditing({ ...editing, tax: e.target.value })} placeholder="Paid / Due" /></Field>
              <Field label="C/O"><Input value={editing.co} onChange={(e) => setEditing({ ...editing, co: e.target.value })} /></Field>
              <Field label={isAdmin ? "ASSIGN TO STAFF" : "ASSIGNED TO"} full>
                <Select
                  value={editing.assignee || "__none"}
                  onValueChange={(v) => setEditing({ ...editing, assignee: v === "__none" ? "" : v })}
                  disabled={!isAdmin}
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Unassigned</SelectItem>
                    {STAFF_USERS.map((s) => <SelectItem key={s.username} value={s.username}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {isAdmin && <p className="text-xs text-muted-foreground">A task is auto-created for the assignee and stays in sync with the record status.</p>}
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn("space-y-1.5", full && "sm:col-span-2")}>
      <Label className="text-xs font-semibold tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
