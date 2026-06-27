import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FileText, Trash2, Plus, Search, ExternalLink, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addDoc,
  deleteDoc,
  subscribeToAllDocs,
  type CustomerDoc,
  GENERAL_CUSTOMER_ID,
} from "@/lib/customerDocs";
import { subscribeToCustomers, type CustomerProfile } from "@/lib/customers";

const DOC_TYPES = [
  "RC Book",
  "Insurance",
  "Fitness Certificate",
  "Tax Receipt",
  "PUC Certificate",
  "Permit",
  "Invoice",
  "Estimate",
  "Payment Receipt",
  "Other",
];
const MAX_FILE_MB = 10;

export const Route = createFileRoute("/dashboard/documents")({ component: DocumentsPage });

function DocumentsPage() {
  const [docs, setDocs] = useState<CustomerDoc[]>([]);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const unsubDocs = subscribeToAllDocs(setDocs);
    const unsubCustomers = subscribeToCustomers(setCustomers);
    return () => {
      unsubDocs();
      unsubCustomers();
    };
  }, []);

  const customerMap = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer.name])),
    [customers],
  );

  const filteredDocs = useMemo(() => {
    return docs.filter((doc) => {
      const matchesQuery = [doc.name, doc.type, customerMap.get(doc.customerId) ?? "General"].some(
        (value) => value.toLowerCase().includes(query.toLowerCase()),
      );
      const matchesType = typeFilter === "all" || doc.type === typeFilter;
      const matchesCustomer = customerFilter === "all" || doc.customerId === customerFilter;
      return matchesQuery && matchesType && matchesCustomer;
    });
  }, [docs, query, typeFilter, customerFilter, customerMap]);

  const customerOptions = useMemo(() => {
    return [{ id: GENERAL_CUSTOMER_ID, name: "General / Unlinked" }, ...customers];
  }, [customers]);

  const typeOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(docs.map((doc) => doc.type))).sort()];
  }, [docs]);

  const groupedByType = useMemo(() => {
    return filteredDocs.reduce<Record<string, CustomerDoc[]>>((groups, doc) => {
      groups[doc.type] = groups[doc.type] ?? [];
      groups[doc.type].push(doc);
      return groups;
    }, {});
  }, [filteredDocs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Documents</h2>
          <p className="text-sm text-muted-foreground">
            Manage client documents, permits, invoices, and records.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="size-4 mr-1" />
            Add Document
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Search
          </Label>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents, customers, or types"
              className="pl-10"
            />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Filter by type
          </Label>
          <select
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {type === "all" ? "All document types" : type}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Filter by customer
          </Label>
          <select
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
          >
            <option value="all">All customers</option>
            {customerOptions.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredDocs.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          No documents match your filters.
        </div>
      ) : (
        Object.entries(groupedByType).map(([type, docsOfType]) => (
          <div key={type} className="rounded-xl border bg-card overflow-hidden">
            <div className="border-b bg-muted/60 px-5 py-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{type}</div>
                <div className="text-xs text-muted-foreground">
                  {docsOfType.length} document{docsOfType.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Updated{" "}
                {docsOfType[0]?.addedAt
                  ? new Date(docsOfType[0].addedAt).toLocaleDateString("en-IN")
                  : "—"}
              </div>
            </div>
            <div className="divide-y">
              {docsOfType.map((doc) => (
                <div
                  key={doc.id}
                  className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <FileText className="size-4 text-primary" />
                      <span className="truncate">{doc.name}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{customerMap.get(doc.customerId) ?? "General / Unlinked"}</span>
                      <span>
                        Added{" "}
                        {new Date(doc.addedAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      {doc.fileSize != null && <span>{Math.round(doc.fileSize / 1024)} KB</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {doc.downloadURL ? (
                      <a
                        href={doc.downloadURL}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-md border border-input px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/50"
                      >
                        <ExternalLink className="size-4 mr-1" />
                        View
                      </a>
                    ) : (
                      <span className="rounded-md border border-muted-foreground/30 px-3 py-2 text-xs text-muted-foreground">
                        Metadata only
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteDoc(doc.id, doc.storagePath)}
                      title="Delete document"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <AddDocumentModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        customers={customerOptions}
      />
    </div>
  );
}

interface AddDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: { id: string; name: string }[];
}

function AddDocumentModal({ open, onOpenChange, customers }: AddDocumentModalProps) {
  const [customerId, setCustomerId] = useState(GENERAL_CUSTOMER_ID);
  const [name, setName] = useState("");
  const [type, setType] = useState(DOC_TYPES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (customers.length > 0 && customerId === GENERAL_CUSTOMER_ID) return;
    if (!customers.some((customer) => customer.id === customerId)) {
      setCustomerId(customers[0]?.id ?? GENERAL_CUSTOMER_ID);
    }
  }, [customers, customerId]);

  const resetForm = () => {
    setCustomerId(GENERAL_CUSTOMER_ID);
    setName("");
    setType(DOC_TYPES[0]);
    setFile(null);
    setError("");
    setUploadPct(0);
    setUploading(false);
  };

  const handleAddDocument = async () => {
    if (!name.trim()) {
      setError("Please enter a document name.");
      return;
    }
    if (file && file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`File too large — max ${MAX_FILE_MB} MB.`);
      return;
    }

    setUploading(true);
    setError("");
    try {
      await addDoc(customerId, name.trim(), type, file ?? undefined, setUploadPct);
      resetForm();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save document.";
      setError(message);
      console.error("[DocumentsPage] Document upload failed:", err);
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Document</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">Document name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="E.g. RC Book 2024"
                disabled={uploading}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">Document type</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={uploading}
              >
                {DOC_TYPES.map((docType) => (
                  <option key={docType} value={docType}>
                    {docType}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">Link to customer</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              disabled={uploading}
            >
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">
              Upload file (optional)
            </Label>
            <label className="flex items-center gap-2 rounded-md border border-dashed border-input bg-background px-3 py-3 text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors">
              <Upload className="size-4" />
              <span>{file?.name ?? "Select file to upload"}</span>
              <input
                type="file"
                accept="*/*"
                className="hidden"
                onChange={(e) => {
                  const selected = e.target.files?.[0] ?? null;
                  setFile(selected);
                  if (selected && !name) {
                    setName(selected.name.replace(/\.[^/.]+$/, ""));
                  }
                }}
                disabled={uploading}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Supported: PDF, image, Word, and text files. Max {MAX_FILE_MB} MB.
            </p>
          </div>

          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span>Uploading… {uploadPct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleAddDocument} disabled={uploading}>
            {uploading ? "Uploading…" : "Save Document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
