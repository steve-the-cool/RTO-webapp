import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  Search,
  Car,
  Plus,
  Trash2,
  X,
  ChevronRight,
  Upload,
  ExternalLink,
  Loader2,
  Paperclip,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  subscribeToCustomers,
  type CustomerProfile,
  type VehicleRecord,
  addAttachment,
  type CustomerAttachment,
} from "@/lib/customers";
import {
  subscribeToDocsFor,
  addDoc,
  deleteDoc,
  type CustomerDoc,
} from "@/lib/customerDocs";
import type { RecordStatus } from "@/lib/records";
import { storage } from "@/lib/firebase";
import { uploadBytesResumable, getDownloadURL, ref } from "firebase/storage";

export const Route = createFileRoute("/dashboard/customers")({
  component: CustomersPage,
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function avatarColor(name: string) {
  const colors = [
    "bg-orange-100 text-orange-700",
    "bg-blue-100 text-blue-700",
    "bg-green-100 text-green-700",
    "bg-purple-100 text-purple-700",
    "bg-pink-100 text-pink-700",
    "bg-yellow-100 text-yellow-800",
    "bg-teal-100 text-teal-700",
    "bg-red-100 text-red-700",
  ];
  const idx = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
  return colors[idx];
}

function statusBadge(status: RecordStatus) {
  switch (status) {
    case "Completed": return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "In Progress": return "bg-blue-100 text-blue-700 border-blue-200";
    case "On Hold": return "bg-amber-100 text-amber-700 border-amber-200";
    default: return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

// ─── Vehicle Details Modal ────────────────────────────────────────────────────

function VehicleModal({ customer, onClose }: { customer: CustomerProfile; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="size-5 text-primary" />
            Vehicles — {customer.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-1">
          {customer.vehicles.map((v) => (
            <div key={v.id} className="rounded-xl border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-base text-primary">{v.mvNo}</span>
                <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", statusBadge(v.status))}>
                  {v.status}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <InfoCell label="Work" value={v.work} />
                <InfoCell label="Insurance" value={v.insurance} />
                <InfoCell label="Fitness" value={v.fitness} />
                <InfoCell label="Tax" value={v.tax} />
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">{value || "—"}</div>
    </div>
  );
}

// ─── Attachments Modal ────────────────────────────────────────────────────────

const MAX_ATTACHMENT_MB = 10;

function AttachmentsModal({ customer, onClose }: { customer: CustomerProfile; onClose: () => void }) {
  const [attachments, setAttachments] = useState<CustomerAttachment[]>(customer.attachments ?? []);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState("");
  const [currentUser, setCurrentUser] = useState("admin");

  useEffect(() => {
    // Get current user from localStorage (same pattern as other components)
    const userEmail = localStorage.getItem("userEmail") ?? "admin";
    setCurrentUser(userEmail);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      setError(`File too large — max ${MAX_ATTACHMENT_MB} MB.`);
      return;
    }
    setError("");
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file");
      return;
    }

    console.log("[AttachmentsModal] ========== UPLOAD FLOW START ==========");
    console.log("[AttachmentsModal] FILE_SELECTED:", {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      customerId: customer.id,
    });
    setUploading(true);
    setUploadPct(0);
    setError("");

    try {
      const attachmentId = crypto.randomUUID();
      const storagePath = `customers/${customer.id}/attachments/${attachmentId}_${file.name}`;
      const storageRef = ref(storage, storagePath);

      console.log("[AttachmentsModal] UPLOAD_STARTED:", {
        storagePath,
        storageRefPath: storageRef.fullPath,
        bucket: storageRef.bucket,
      });

      // Use Promise wrapper for better control and timeout handling
      const downloadUrl = await uploadFileWithTimeout(storageRef, file, (pct) => {
        console.log("[AttachmentsModal] UPLOAD_PROGRESS:", {
          percentage: pct,
          fileName: file.name,
        });
        setUploadPct(pct);
      });

      console.log("[AttachmentsModal] UPLOAD_SUCCESS:", {
        downloadUrl: downloadUrl.substring(0, 50) + "...",
      });

      const newAttachment: CustomerAttachment = {
        id: attachmentId,
        name: file.name,
        type: file.type || "unknown",
        size: file.size,
        storagePath,
        downloadUrl,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser,
      };

      console.log("[AttachmentsModal] FIRESTORE_SAVE_STARTED:", {
        customerId: customer.id,
        attachmentName: newAttachment.name,
        attachmentSize: newAttachment.size,
      });
      await addAttachment(customer.id, newAttachment);
      console.log("[AttachmentsModal] FIRESTORE_SAVE_SUCCESS:", {
        attachmentId: newAttachment.id,
      });

      setAttachments([newAttachment, ...attachments]);
      setFile(null);
      setError("");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error("[AttachmentsModal] UPLOAD_ERROR:", {
        error: err,
        errorMessage: errorMsg,
        errorStack: err instanceof Error ? err.stack : "N/A",
      });
      setError(errorMsg);
    } finally {
      console.log("[AttachmentsModal] ========== UPLOAD FLOW END ==========");
      setUploading(false);
      setUploadPct(0);
    }
  };

  // Upload helper with timeout and Promise wrapper
  const uploadFileWithTimeout = async (
    storageRef: any,
    uploadFile: File,
    onProgress: (pct: number) => void,
  ): Promise<string> => {
    console.log("[uploadFileWithTimeout] Starting upload:", {
      refPath: storageRef.fullPath,
      refBucket: storageRef.bucket,
      fileName: uploadFile.name,
      fileSize: uploadFile.size,
      fileType: uploadFile.type,
    });

    return new Promise<string>((resolve, reject) => {
      let uploadTimeout: NodeJS.Timeout | null = null;
      let resolved = false;

      // Set a timeout for the entire upload
      uploadTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.error("[uploadFileWithTimeout] TIMEOUT_FIRED - Upload exceeded 120 seconds");
          reject(new Error("Upload timeout — file took too long. Please try again or use a smaller file."));
        }
      }, 120000); // 2 minutes

      const task = uploadBytesResumable(storageRef, uploadFile, {
        contentType: uploadFile.type || "application/octet-stream",
        customMetadata: {
          uploadedAt: new Date().toISOString(),
        },
      });

      console.log("[uploadFileWithTimeout] uploadBytesResumable task created:", {
        taskState: task.state,
      });

      task.on(
        "state_changed",
        (snapshot) => {
          if (!resolved) {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            console.log("[uploadFileWithTimeout] PROGRESS_CALLBACK:", {
              state: snapshot.state,
              bytesTransferred: snapshot.bytesTransferred,
              totalBytes: snapshot.totalBytes,
              percentage: pct,
            });
            onProgress(pct);
          } else {
            console.warn("[uploadFileWithTimeout] Progress callback ignored - already resolved");
          }
        },
        (error) => {
          if (!resolved) {
            resolved = true;
            if (uploadTimeout) clearTimeout(uploadTimeout);
            console.error("[uploadFileWithTimeout] ERROR_CALLBACK:", {
              code: (error as any)?.code,
              message: error.message,
              fullError: error,
            });
            reject(error);
          } else {
            console.warn("[uploadFileWithTimeout] Error callback ignored - already resolved");
          }
        },
        async () => {
          if (!resolved) {
            resolved = true;
            if (uploadTimeout) clearTimeout(uploadTimeout);
            try {
              console.log("[uploadFileWithTimeout] SUCCESS_CALLBACK - Upload complete, state:", {
                taskState: task.state,
                snapshotState: task.snapshot.state,
              });
              console.log("[uploadFileWithTimeout] Getting download URL from:", {
                refPath: task.snapshot.ref.fullPath,
                refBucket: task.snapshot.ref.bucket,
              });
              const url = await getDownloadURL(task.snapshot.ref);
              console.log("[uploadFileWithTimeout] DOWNLOAD_URL_OBTAINED:", {
                urlPrefix: url.substring(0, 50) + "...",
                urlLength: url.length,
              });
              resolve(url);
            } catch (error) {
              console.error("[uploadFileWithTimeout] getDownloadURL FAILED:", {
                code: (error as any)?.code,
                message: (error as any)?.message,
                fullError: error,
              });
              reject(error);
            }
          } else {
            console.warn("[uploadFileWithTimeout] Success callback ignored - already resolved");
          }
        },
      );
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="size-5 text-primary" />
            Attachments — {customer.name}
          </DialogTitle>
        </DialogHeader>

        {/* Upload section */}
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Attachment</p>

          {/* File picker */}
          <div className="space-y-1">
            <Label className="text-xs">Select file (max {MAX_ATTACHMENT_MB} MB)</Label>
            <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-input bg-background px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
              <Paperclip className="size-4 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground truncate">
                {file ? file.name : "Click to choose file…"}
              </span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,image/*,.doc,.docx,.jpg,.jpeg,.png,.txt,.xlsx,.xls"
                onChange={handleFileChange}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Supported: PDF, Images (JPG, PNG), Documents (DOC, DOCX, XLS, XLSX, TXT) • Max: {MAX_ATTACHMENT_MB} MB
            </p>
          </div>

          {/* Upload progress */}
          {uploading && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span>Uploading attachment…</span>
                <span className="font-semibold">{uploadPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-blue-200 overflow-hidden">
                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadPct}%` }} />
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2">
              <p className="text-xs text-red-800">{error}</p>
            </div>
          )}

          {/* Upload button */}
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full"
          >
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="size-4 mr-2" />
                Upload Attachment
              </>
            )}
          </Button>
        </div>

        {/* Attachments list */}
        {attachments.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No attachments yet
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Attachments</p>
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center justify-between rounded-lg border bg-muted/30 p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Paperclip className="size-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <a
                      href={att.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline truncate block"
                    >
                      {att.name}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      {(att.size / 1024 / 1024).toFixed(2)} MB • {new Date(att.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <a
                  href={att.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center size-8 rounded-md bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors flex-shrink-0"
                >
                  <ExternalLink className="size-4" />
                </a>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Documents Modal ──────────────────────────────────────────────────────────

const DOC_TYPES = ["RC Book", "Insurance", "Fitness Certificate", "Tax Receipt", "PUC Certificate", "Other"];
const MAX_FILE_MB = 5; // Reduced from 10 to 5 for better upload reliability

function DocsModal({ customer, onClose }: { customer: CustomerProfile; onClose: () => void }) {
  const [docs, setDocs] = useState<CustomerDoc[]>([]);
  const [form, setForm] = useState({ name: "", type: "RC Book" });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  // ── Live subscription ──────────────────────────────────────────────────────
  useEffect(() => {
    console.log("[DocsModal] Setting up subscription for customer:", customer.id);
    const unsub = subscribeToDocsFor(customer.id, (newDocs) => {
      console.log("[DocsModal] Documents updated:", newDocs.length, "docs");
      setDocs(newDocs);
    });
    return unsub;
  }, [customer.id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`File too large — max ${MAX_FILE_MB} MB.`);
      return;
    }
    setError("");
    setFile(f);
    if (!form.name) setForm((prev) => ({ ...prev, name: f.name.replace(/\.[^.]+$/, "") }));
  };

  const handleAdd = async () => {
    if (!form.name.trim()) {
      setError("Please enter a document name");
      return;
    }
    
    console.log("[DocsModal] handleAdd called - name:", form.name, "type:", form.type, "hasFile:", !!file);
    
    setUploading(true);
    setUploadPct(0);
    setError("");
    
    try {
      console.log("[DocsModal] Calling addDoc...");
      const result = await addDoc(
        customer.id,
        form.name.trim(),
        form.type,
        file ?? undefined,
        (pct) => {
          console.log("[DocsModal] Progress:", pct);
          setUploadPct(pct);
        },
      );
      console.log("[DocsModal] Document added successfully:", result);
      setForm({ name: "", type: "RC Book" });
      setFile(null);
      setError(""); // Clear any previous errors
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error occurred";
      console.error("[DocsModal] Upload error:", err);
      console.error("[DocsModal] Error details:", { message: errorMsg, fullError: err });
      setError(errorMsg);
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  const handleDelete = async (d: CustomerDoc) => {
    setDeleting(d.id);
    try {
      await deleteDoc(d.id, d.storagePath);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            Documents — {customer.name}
          </DialogTitle>
        </DialogHeader>

        {/* Add document form */}
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Document</p>

          <div className="grid sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Document Name</Label>
              <Input
                placeholder="e.g. RC Book 2024"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && !uploading && handleAdd()}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* File picker */}
          <div className="space-y-1">
            <Label className="text-xs">Attach file (optional, max {MAX_FILE_MB} MB)</Label>
            <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-input bg-background px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
              <Upload className="size-4 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground truncate">
                {file ? file.name : "Click to choose PDF, image…"}
              </span>
              <input type="file" className="hidden" accept=".pdf,image/*,.doc,.docx,.jpg,.jpeg,.png" onChange={handleFileChange} />
            </label>
            <p className="text-xs text-muted-foreground">
              Supported: PDF, Images (JPG, PNG), Word (DOC, DOCX) • Max size: {MAX_FILE_MB} MB
            </p>
          </div>

          {/* Upload progress */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span>Uploading document…</span>
                <span className="font-semibold">{uploadPct}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadPct}%` }} />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-xs font-bold text-destructive">Error: {error}</p>
                  <p className="text-xs text-destructive/80 mt-1">
                    💡 Check your internet connection, try a smaller file, or contact support if the issue persists.
                  </p>
                </div>
              </div>
            </div>
          )}

          <Button 
            size="sm" 
            onClick={handleAdd} 
            className="w-full" 
            disabled={uploading || !form.name.trim()}
          >
            {uploading ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Plus className="size-4 mr-1" />
                {file ? "Upload & Add Document" : "Add Document"}
              </>
            )}
          </Button>
        </div>

        {/* Document list */}
        <div className="rounded-xl border bg-card divide-y">
          {docs.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">No documents added yet.</div>
          )}
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <div className="size-8 rounded-lg bg-primary/10 grid place-items-center flex-shrink-0">
                <FileText className="size-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{d.name}</div>
                <div className="text-xs text-muted-foreground">
                  {d.type} • {new Date(d.addedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  {d.fileSize ? ` • ${(d.fileSize / 1024).toFixed(0)} KB` : ""}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {d.downloadUrl && (
                  <a
                    href={d.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    title="Open file"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(d)}
                  disabled={deleting === d.id}
                >
                  {deleting === d.id
                    ? <Loader2 className="size-4 animate-spin" />
                    : <Trash2 className="size-4 text-destructive" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [query, setQuery] = useState("");
  const [vehicleModal, setVehicleModal] = useState<CustomerProfile | null>(null);
  const [docsModal, setDocsModal] = useState<CustomerProfile | null>(null);
  const [attachmentsModal, setAttachmentsModal] = useState<CustomerProfile | null>(null);

  useEffect(() => {
    const unsub = subscribeToCustomers(setCustomers);
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return customers;
    const q = query.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.mobile.includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.vehicles.some((v) => v.mvNo.toLowerCase().includes(q)),
    );
  }, [customers, query]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Customers</h2>
        <p className="text-sm text-muted-foreground">{customers.length} customer records</p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, mobile, email…"
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="grid grid-cols-[2fr_2fr_2fr_auto_auto_auto] gap-4 px-4 py-3 bg-muted/50 border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Name</div>
          <div>Contact</div>
          <div>Vehicles</div>
          <div className="text-center">Attachments</div>
          <div className="text-center">Documents</div>
          <div className="text-center">Details</div>
        </div>

        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-muted-foreground text-sm">No customers found.</div>
        )}
        {filtered.map((c) => {
          const hasMultipleVehicles = c.vehicles.length > 1;
          const primaryVehicle = c.vehicles[0];

          return (
            <div
              key={c.id}
              className="grid grid-cols-[2fr_2fr_2fr_auto_auto_auto] gap-4 items-center px-4 py-3 border-b last:border-0 hover:bg-muted/20 transition-colors"
            >
              {/* Name */}
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn("size-9 rounded-full grid place-items-center text-sm font-bold flex-shrink-0", avatarColor(c.name))}>
                  {initials(c.name)}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.address}</div>
                </div>
              </div>

              {/* Contact */}
              <div className="min-w-0">
                <div className="text-sm font-medium">{c.mobile}</div>
                <div className="text-xs text-muted-foreground truncate">{c.email}</div>
              </div>

              {/* Vehicles */}
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium">{primaryVehicle?.mvNo ?? "—"}</span>
                {hasMultipleVehicles && (
                  <button
                    onClick={() => setVehicleModal(c)}
                    title={`View all ${c.vehicles.length} vehicles`}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 hover:bg-primary/20 text-primary px-2 py-0.5 text-xs font-medium transition-colors"
                  >
                    <Car className="size-3" />+{c.vehicles.length - 1}
                  </button>
                )}
              </div>

              {/* Attachments icon */}
              <div className="flex justify-center">
                <button
                  onClick={() => setAttachmentsModal(c)}
                  title="View / add attachments"
                  className="size-9 rounded-lg flex items-center justify-center bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors"
                >
                  <Paperclip className="size-4" />
                </button>
              </div>

              {/* Documents icon */}
              <div className="flex justify-center">
                <button
                  onClick={() => setDocsModal(c)}
                  title="View / add structured documents"
                  className="size-9 rounded-lg flex items-center justify-center bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors"
                >
                  <FileText className="size-4" />
                </button>
              </div>

              {/* Details chevron */}
              <div className="flex justify-center">
                <button
                  onClick={() => setVehicleModal(c)}
                  title="View full details"
                  className="size-9 rounded-lg flex items-center justify-center bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {vehicleModal && <VehicleModal customer={vehicleModal} onClose={() => setVehicleModal(null)} />}
      {attachmentsModal && <AttachmentsModal customer={attachmentsModal} onClose={() => setAttachmentsModal(null)} />}
      {docsModal && <DocsModal customer={docsModal} onClose={() => setDocsModal(null)} />}
    </div>
  );
}
