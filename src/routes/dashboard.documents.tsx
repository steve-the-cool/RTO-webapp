import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Trash2, Plus } from "lucide-react";

interface DocItem { id: string; name: string; type: string; linkedTo: string; addedAt: string; }
const KEY = "registry-documents";

const load = (): DocItem[] => {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
};

export const Route = createFileRoute("/dashboard/documents")({ component: DocumentsPage });

function DocumentsPage() {
  const [items, setItems] = useState<DocItem[]>([]);
  const [form, setForm] = useState({ name: "", type: "RC Book", linkedTo: "" });

  useEffect(() => { setItems(load()); }, []);
  const persist = (i: DocItem[]) => { setItems(i); localStorage.setItem(KEY, JSON.stringify(i)); };

  const add = () => {
    if (!form.name.trim()) return;
    persist([{ id: crypto.randomUUID(), name: form.name.trim(), type: form.type, linkedTo: form.linkedTo, addedAt: new Date().toISOString() }, ...items]);
    setForm({ name: "", type: "RC Book", linkedTo: "" });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Documents</h2>
        <p className="text-sm text-muted-foreground">Track scanned papers, RC books, permits and forms.</p>
      </div>

      <div className="rounded-xl border bg-card p-4 grid sm:grid-cols-4 gap-3">
        <Input placeholder="Document name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input placeholder="Type (RC, Insurance…)" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
        <Input placeholder="Linked MV / Customer" value={form.linkedTo} onChange={(e) => setForm({ ...form, linkedTo: e.target.value })} />
        <Button onClick={add}><Plus className="size-4 mr-1" />Add document</Button>
      </div>

      <div className="rounded-xl border bg-card divide-y">
        {items.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">No documents recorded.</div>}
        {items.map((d) => (
          <div key={d.id} className="flex items-center gap-3 px-4 py-3">
            <FileText className="size-5 text-primary" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{d.name}</div>
              <div className="text-xs text-muted-foreground">{d.type} • {d.linkedTo || "—"} • {new Date(d.addedAt).toLocaleDateString()}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => persist(items.filter((x) => x.id !== d.id))}><Trash2 className="size-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
