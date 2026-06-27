import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Car,
  Plus,
  Trash2,
  Pencil,
  DollarSign,
  CheckCircle2,
  Clock,
  Phone,
  ArrowRight,
  ChevronDown,
  User,
  MapPin,
  Briefcase,
  Calendar,
  AlertCircle,
  FileText,
  Eye,
  Download,
  Upload,
} from "lucide-react";
import {
  type Client,
  type Vehicle,
  type Service,
  type ServiceTaskStatus,
  saveClient,
  saveVehicle,
  deleteVehicle,
  saveService,
  deleteService,
  subscribeToClientDetails,
  getProgressFromStatus,
  addVehicleDocument,
  deleteVehicleDocument,
  type VehicleDocument,
} from "@/lib/hierarchy";
import { SERVICE_TYPES, serviceLabel, STAFF_USERS } from "@/lib/records";
import { generatePDF } from "@/lib/pdfGenerator";
import { toast } from "sonner";
import { WhatsAppMessagePanel } from "@/components/WhatsAppMessagePanel";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { storage, auth } from "@/lib/firebase";
import { getSession } from "@/lib/auth";
import { subscribeStaffPermissions, type RolePermissions } from "@/lib/permissions";
import { secureDelete } from "@/lib/secureDelete";
import {
  type ClientDocument,
  type VehicleDocumentInfo,
  subscribeClientDocs,
  subscribeVehicleDocs,
  saveClientDocument,
  saveVehicleDocument,
  deleteClientDocEntry,
  deleteVehicleDocEntry,
} from "@/lib/structuredDocs";

interface ClientDetailWorkspaceProps {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TASK_STAGES: ServiceTaskStatus[] = [
  "Not Started",
  "Documents Collected",
  "Verification",
  "Submitted",
  "Approved",
  "Completed",
];

const CLIENT_DOC_SLOTS = [
  { key: "aadhaar", label: "Aadhaar Card" },
  { key: "pan", label: "PAN Card" },
  { key: "passport", label: "Passport" },
  { key: "driving_license", label: "Driving License" },
  { key: "photo", label: "Client Photo" },
  { key: "address_proof", label: "Address Proof" },
  { key: "other", label: "Other Client Documents" },
];

const VEHICLE_DOC_SLOTS = [
  { key: "rc_book", label: "RC Book" },
  { key: "insurance", label: "Insurance Copy" },
  { key: "fitness", label: "Fitness Certificate" },
  { key: "gujarat_permit", label: "Gujarat Permit" },
  { key: "national_permit", label: "National Permit" },
  { key: "tax", label: "Tax Documents" },
  { key: "puc", label: "PUC Certificate" },
  { key: "other", label: "Other Vehicle Documents" },
];

export function ClientDetailWorkspace({
  clientId,
  open,
  onOpenChange,
}: ClientDetailWorkspaceProps) {
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Modal / Form States
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [clientForm, setClientForm] = useState<Partial<Client>>({});

  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Partial<Vehicle> | null>(null);
  const [vehicleForm, setVehicleForm] = useState<Partial<Vehicle>>({});

  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Partial<Service> | null>(null);
  const [serviceForm, setServiceForm] = useState<Partial<Service>>({});

  const [previewDoc, setPreviewDoc] = useState<{ url: string; type: string; name: string } | null>(
    null,
  );

  const [clientDocs, setClientDocs] = useState<ClientDocument[]>([]);
  const [vehicleDocs, setVehicleDocs] = useState<VehicleDocumentInfo[]>([]);
  const [docProgress, setDocProgress] = useState<Record<string, number>>({});
  const [viewerDoc, setViewerDoc] = useState<{ url: string; name: string; isPdf: boolean } | null>(
    null,
  );
  const [zoom, setZoom] = useState(1);

  const [rolePermissions, setRolePermissions] = useState<any>(null);
  const session = getSession();
  const isAdmin = session?.role === "admin";
  const canEdit = isAdmin || (rolePermissions?.editClients ?? true);

  useEffect(() => {
    const unsubPerms = subscribeStaffPermissions((p) => {
      setRolePermissions(p);
    });
    return unsubPerms;
  }, []);

  useEffect(() => {
    if (!clientId) return;
    const unsubClientDocs = subscribeClientDocs(clientId, setClientDocs);
    const unsubVehicleDocs = subscribeVehicleDocs(clientId, setVehicleDocs);
    return () => {
      unsubClientDocs();
      unsubVehicleDocs();
    };
  }, [clientId]);

  // Load real-time client details (includes nested vehicles & services)
  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    const unsub = subscribeToClientDetails(clientId, (data) => {
      setDetails(data);
      setLoading(false);
    });
    return unsub;
  }, [clientId]);

  // Handle Client Save
  const handleEditClient = () => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    if (!details) return;
    setClientForm(details);
    setEditClientOpen(true);
  };

  const handleSaveClient = async () => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    try {
      const actorOverride = session
        ? { name: session.name, uid: session.uid, role: session.role }
        : undefined;
      await saveClient(clientForm as Client, actorOverride);
      setEditClientOpen(false);
      toast.success("Client profile updated successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save client profile.");
    }
  };

  // Handle Vehicle Save / Delete
  const handleOpenVehicleModal = (v?: Vehicle) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    if (v) {
      setEditingVehicle(v);
      setVehicleForm(v);
    } else {
      setEditingVehicle(null);
      setVehicleForm({
        id: `vehicle_${crypto.randomUUID()}`,
        clientId,
        vehicleNumber: "",
        vehicleType: "Commercial",
        chassisNumber: "",
        engineNumber: "",
        registrationDate: "",
        status: "Pending",
      });
    }
    setVehicleModalOpen(true);
  };

  const handleSaveVehicle = async () => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    if (!vehicleForm.vehicleNumber?.trim()) {
      toast.error("Vehicle Number is required");
      return;
    }
    try {
      const actorOverride = session
        ? { name: session.name, uid: session.uid, role: session.role }
        : undefined;
      await saveVehicle(vehicleForm as Vehicle, actorOverride);
      setVehicleModalOpen(false);
      toast.success(editingVehicle ? "Vehicle updated!" : "Vehicle added!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save vehicle.");
    }
  };

  const handleDeleteVehicle = async (vId: string) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    if (!confirm("Are you sure you want to delete this vehicle and all associated services?")) {
      return;
    }
    try {
      await secureDelete(
  () => deleteVehicle(vId),
  "Vehicle",
  vId,
  session?.uid ?? "unknown"
);
      toast.success("Vehicle deleted successfully.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete vehicle.");
    }
  };

  // Handle Service Save / Delete
  const handleOpenServiceModal = (vehicleId: string, s?: Service) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    if (s) {
      setEditingService(s);
      setServiceForm(s);
    } else {
      setEditingService(null);
      setServiceForm({
        id: `service_${crypto.randomUUID()}`,
        vehicleId,
        serviceType: "Insurance",
        dueDate: "",
        serviceAmount: 0,
        amountReceived: 0,
        assignedStaff: "",
        taskStatus: "Not Started",
        notes: "",
      });
    }
    setServiceModalOpen(true);
  };

  const handleSaveService = async () => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    try {
      const actorOverride = session
        ? { name: session.name, uid: session.uid, role: session.role }
        : undefined;
      await saveService(serviceForm as Service, actorOverride);
      setServiceModalOpen(false);
      toast.success(editingService ? "Service updated!" : "Service added!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save service.");
    }
  };

  const handleDeleteService = async (sId: string) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    if (!confirm("Are you sure you want to delete this service?")) {
      return;
    }
    try {
      const actorOverride = session
        ? { name: session.name, uid: session.uid, role: session.role }
        : undefined;
      await secureDelete(
  () => deleteService(sId, actorOverride),
  "Service",
  sId,
  session?.uid ?? "unknown"
);
      toast.success("Service deleted.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete service.");
    }
  };

  // Update Service Status directly (stepper)
  const handleUpdateServiceStatus = async (service: Service, status: ServiceTaskStatus) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    try {
      const actorOverride = session
        ? { name: session.name, uid: session.uid, role: session.role }
        : undefined;
      await saveService(
        {
          ...service,
          taskStatus: status,
        },
        actorOverride,
      );
      toast.success(`Service status updated to ${status}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update status.");
    }
  };

  const handleUploadDocument = (vehicleId: string) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,image/png,image/jpeg,image/jpg";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      // Check size (10 MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be under 10 MB");
        return;
      }

      // Check type
      const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
      if (!allowedTypes.includes(file.type)) {
        toast.error("Allowed formats: PDF, JPG, JPEG, PNG");
        return;
      }

      const docId = crypto.randomUUID();
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const storagePath = `vehicle_documents/${clientId}/${vehicleId}/${docId}_${cleanFileName}`;
      const storageRef = ref(storage, storagePath);

      console.log("[Storage Upload]", storagePath);
      console.log("[Storage User]", auth.currentUser);

      toast.loading("Uploading document...", { id: "upload-doc" });
      try {
        const uploadTask = uploadBytesResumable(storageRef, file, { contentType: file.type });

        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            null,
            (error) => reject(error),
            () => resolve(),
          );
        });

        const fileUrl = await getDownloadURL(storageRef);
        const userEmail = localStorage.getItem("userEmail") ?? "admin";

        const newDoc: VehicleDocument = {
          id: docId,
          fileName: file.name,
          fileUrl,
          storagePath,
          uploadedAt: new Date().toISOString(),
          uploadedBy: userEmail,
          fileType: file.type.includes("pdf") ? "pdf" : "image",
        };

        const actorOverride = session
          ? { name: session.name, uid: session.uid, role: session.role }
          : undefined;
        await addVehicleDocument(vehicleId, newDoc, actorOverride);
        toast.success("Document uploaded successfully!", { id: "upload-doc" });
      } catch (err: any) {
        console.error(err);
        toast.error(`Upload failed: ${err.message || err}`, { id: "upload-doc" });
      }
    };
    input.click();
  };

  const handleUploadClientDoc = async (category: string, file: File) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    const existing = clientDocs.find((d) => d.category === category) || null;
    toast.loading(`Uploading ${category}...`, { id: `upload-client-${category}` });
    try {
      await saveClientDocument(clientId, category as any, file, existing, (pct) => {
        setDocProgress((prev) => ({ ...prev, [`client-${category}`]: pct }));
      });
      toast.success("Document saved successfully!", { id: `upload-client-${category}` });
    } catch (err: any) {
      console.error(err);
      toast.error(`Upload failed: ${err.message || err}`, { id: `upload-client-${category}` });
    } finally {
      setDocProgress((prev) => {
        const next = { ...prev };
        delete next[`client-${category}`];
        return next;
      });
    }
  };

  const handleUploadVehicleDoc = async (vehicleId: string, documentType: string, file: File) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    const existing =
      vehicleDocs.find((d) => d.vehicleId === vehicleId && d.documentType === documentType) || null;
    toast.loading(`Uploading ${documentType}...`, {
      id: `upload-vehicle-${vehicleId}-${documentType}`,
    });
    try {
      await saveVehicleDocument(clientId, vehicleId, documentType as any, file, existing, (pct) => {
        setDocProgress((prev) => ({ ...prev, [`vehicle-${vehicleId}-${documentType}`]: pct }));
      });
      toast.success("Vehicle document saved successfully!", {
        id: `upload-vehicle-${vehicleId}-${documentType}`,
      });
    } catch (err: any) {
      console.error(err);
      toast.error(`Upload failed: ${err.message || err}`, {
        id: `upload-vehicle-${vehicleId}-${documentType}`,
      });
    } finally {
      setDocProgress((prev) => {
        const next = { ...prev };
        delete next[`vehicle-${vehicleId}-${documentType}`];
        return next;
      });
    }
  };

  const handleDeleteClientDoc = async (docObj: ClientDocument) => {
    if (!isAdmin) {
      toast.error("Only administrators can delete documents");
      return;
    }
    if (!confirm("Are you sure you want to delete this document?")) return;
    toast.loading("Deleting document...", { id: "delete-doc" });
    try {
      await secureDelete(
  () => deleteClientDocEntry(docObj),
  "ClientDocument",
  docObj.id,
  session?.uid ?? "unknown"
);
      toast.success("Document deleted successfully!", { id: "delete-doc" });
    } catch (err: any) {
      console.error(err);
      toast.error(`Deletion failed: ${err.message || err}`, { id: "delete-doc" });
    }
  };

  const handleDeleteVehicleDoc = async (docObj: VehicleDocumentInfo) => {
    if (!isAdmin) {
      toast.error("Only administrators can delete documents");
      return;
    }
    if (!confirm("Are you sure you want to delete this document?")) return;
    toast.loading("Deleting document...", { id: "delete-doc" });
    try {
      await secureDelete(
  () => deleteVehicleDocEntry(docObj),
  "VehicleDocument",
  docObj.id,
  session?.uid ?? "unknown"
);
      toast.success("Document deleted successfully!", { id: "delete-doc" });
    } catch (err: any) {
      console.error(err);
      toast.error(`Deletion failed: ${err.message || err}`, { id: "delete-doc" });
    }
  };

  const handleDownloadDocument = async (url: string, fileName: string) => {
    toast.loading("Downloading file...", { id: "download-doc" });
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Download started!", { id: "download-doc" });
    } catch (err: any) {
      console.error("Download failed:", err);
      // Fallback: open in new tab
      window.open(url, "_blank");
      toast.dismiss("download-doc");
    }
  };

  const handleDeleteDocument = async (vehicleId: string, docId: string, storagePath: string) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    if (!confirm("Are you sure you want to delete this document?")) return;
    toast.loading("Deleting document...", { id: "delete-doc" });
    try {
      // Delete from storage
      const storageRef = ref(storage, storagePath);
      try {
        await deleteObject(storageRef);
      } catch (storageErr) {
        console.warn("Storage deletion error:", storageErr);
      }

      // Delete metadata from Firestore
      const actorOverride = session
        ? { name: session.name, uid: session.uid, role: session.role }
        : undefined;
      await deleteVehicleDocument(vehicleId, docId, actorOverride);
      toast.success("Document deleted successfully!", { id: "delete-doc" });
    } catch (err: any) {
      console.error(err);
      toast.error(`Deletion failed: ${err.message || err}`, { id: "delete-doc" });
    }
  };

  // Aggregated lists
  const activeTasks = useMemo(() => {
    if (!details?.vehicles) return [];
    const tasks: any[] = [];
    details.vehicles.forEach((v: any) => {
      v.services.forEach((s: any) => {
        if (s.taskStatus !== "Completed") {
          tasks.push({
            id: s.id,
            vehicleNumber: v.vehicleNumber,
            serviceType: s.serviceType,
            taskStatus: s.taskStatus,
            progress: s.progress,
            dueDate: s.dueDate,
          });
        }
      });
    });
    return tasks;
  }, [details]);

  const serviceWiseAccounting = useMemo(() => {
    if (!details?.vehicles) return [];
    const servicesByType: {
      [type: string]: { totalAmount: number; amountReceived: number; pendingAmount: number };
    } = {};

    details.vehicles.forEach((v: any) => {
      v.services.forEach((s: any) => {
        const type = s.serviceType;
        if (!servicesByType[type]) {
          servicesByType[type] = {
            totalAmount: 0,
            amountReceived: 0,
            pendingAmount: 0,
          };
        }
        servicesByType[type].totalAmount += s.serviceAmount ?? 0;
        servicesByType[type].amountReceived += s.amountReceived ?? 0;
        servicesByType[type].pendingAmount += s.pendingAmount ?? 0;
      });
    });

    return Object.entries(servicesByType).map(([type, accounting]) => ({
      serviceType: type,
      ...accounting,
    }));
  }, [details]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-6 bg-background rounded-2xl border shadow-xl">
        <DialogHeader className="border-b pb-4 mb-4 flex flex-row items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <DialogTitle className="text-2xl font-bold tracking-tight">
                {details?.name || "Client Details"}
              </DialogTitle>
              {details && (
                <Badge
                  variant={details.type === "lead" ? "secondary" : "default"}
                  className="capitalize"
                >
                  {details.type}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Client Workspace • Vehicles, Service Pipelines, and Accounting
            </p>
          </div>
          {details && (
            <div className="flex gap-2 items-center">
              <WhatsAppMessagePanel mobile={details.mobile} name={details.name} />
              <Button
                onClick={() => {
                  generatePDF(
                    "client-details",
                    {
                      name: details.name,
                      mo: details.mobile,
                      email: "",
                      address: details.address || "",
                      group: "",
                      createdAt: "",
                      createdBy: "",
                      vehicles: (details.vehicles || []).map((v: any) => ({
                        vehicleNumber: v.vehicleNumber,
                        vehicleType: v.makeModel || "Commercial",
                        status: "Active",
                        services: (details.services || [])
                          .filter((s: any) => s.vehicleId === v.id)
                          .map((s: any) => s.type),
                      })),
                    },
                    session?.username || "system",
                  );
                }}
                variant="outline"
                size="sm"
                className="bg-red-50 text-red-700 hover:bg-red-100 border-red-200 gap-1.5"
              >
                <FileText className="size-4" />
                Generate Client PDF
              </Button>
              <Button onClick={handleEditClient} variant="outline" size="sm">
                <Pencil className="size-4 mr-2" />
                Edit Profile
              </Button>
            </div>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-muted-foreground text-sm">Loading client details...</p>
          </div>
        ) : !details ? (
          <div className="text-center py-10">
            <p className="text-destructive font-semibold">Client not found.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Client summary & Accounting cards */}
            <div className="grid gap-6 md:grid-cols-3">
              {/* Client Info Summary */}
              <Card className="md:col-span-1 border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase font-bold tracking-wide text-muted-foreground">
                    Client Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Phone className="size-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium">{details.mobile || "No Mobile"}</span>
                  </div>
                  {details.companyName && (
                    <div className="flex items-center gap-2">
                      <Briefcase className="size-4 text-muted-foreground flex-shrink-0" />
                      <span>{details.companyName}</span>
                    </div>
                  )}
                  {details.gstNumber && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-muted-foreground uppercase">GST:</span>
                      <span className="font-mono">{details.gstNumber}</span>
                    </div>
                  )}
                  {details.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="size-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <span className="text-xs leading-normal">{details.address}</span>
                    </div>
                  )}
                  {details.notes && (
                    <div className="border-t pt-2 mt-2">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">Notes</p>
                      <p className="text-xs text-muted-foreground leading-normal mt-1">
                        {details.notes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Accounting Summary */}
              <Card className="md:col-span-2 border shadow-sm bg-muted/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase font-bold tracking-wide text-muted-foreground">
                    Accounting Aggregates
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 border rounded-xl bg-background shadow-sm">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">
                        Total Bill
                      </span>
                      <p className="text-xl font-bold mt-1 text-foreground">
                        ₹{details.accounting.totalAmount.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="p-3 border rounded-xl bg-background shadow-sm">
                      <span className="text-[10px] text-green-700 uppercase font-bold">
                        Received
                      </span>
                      <p className="text-xl font-bold mt-1 text-green-600">
                        ₹{details.accounting.amountReceived.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="p-3 border rounded-xl bg-background shadow-sm">
                      <span className="text-[10px] text-red-700 uppercase font-bold">Pending</span>
                      <p className="text-xl font-bold mt-1 text-red-600">
                        ₹{details.accounting.pendingAmount.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>

                  {serviceWiseAccounting.length > 0 && (
                    <div className="border-t pt-3 space-y-2">
                      <p className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
                        Accounting Summary by Service
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {serviceWiseAccounting.map((item) => (
                          <div
                            key={item.serviceType}
                            className="p-2.5 border rounded-lg bg-background text-xs flex flex-col justify-between"
                          >
                            <span className="font-semibold text-foreground mb-1.5">
                              {serviceLabel(item.serviceType as any)}
                            </span>
                            <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                              <div>
                                <span className="text-muted-foreground block">Total</span>
                                <span className="font-bold">
                                  ₹{item.totalAmount.toLocaleString("en-IN")}
                                </span>
                              </div>
                              <div>
                                <span className="text-green-700 block">Rec</span>
                                <span className="font-bold text-green-600">
                                  ₹{item.amountReceived.toLocaleString("en-IN")}
                                </span>
                              </div>
                              <div>
                                <span className="text-red-700 block">Pend</span>
                                <span className="font-bold text-red-600">
                                  ₹{item.pendingAmount.toLocaleString("en-IN")}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Active Tasks & Pipeline progress */}
            {activeTasks.length > 0 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase font-bold tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Clock className="size-3.5 text-orange-500" />
                    Active Services Pipeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-2">
                  {activeTasks.map((t: any) => (
                    <div
                      key={t.id}
                      className="flex flex-col sm:flex-row justify-between sm:items-center p-3 border rounded-lg bg-card gap-2"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="font-mono text-xs">
                          {t.vehicleNumber}
                        </Badge>
                        <span className="font-semibold text-sm">{serviceLabel(t.serviceType)}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {t.taskStatus}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col text-right">
                          <span className="text-xs font-semibold text-foreground">
                            {t.progress}% Progress
                          </span>
                          {t.dueDate && (
                            <span className="text-[10px] text-muted-foreground mt-0.5">
                              Due: {new Date(t.dueDate).toLocaleDateString("en-IN")}
                            </span>
                          )}
                        </div>
                        <div className="w-24 bg-muted h-2 rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${t.progress}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Structured Client Documents Section */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <FileText className="size-4 text-primary" />
                  Client Documents
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 divide-y">
                {CLIENT_DOC_SLOTS.map((slot) => {
                  const docObj = clientDocs.find((d) => d.category === slot.key) || null;
                  const progress = docProgress[`client-${slot.key}`];
                  return (
                    <div
                      key={slot.key}
                      className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-card hover:bg-muted/5 transition-colors"
                    >
                      <div className="space-y-1">
                        <span className="font-semibold text-sm text-foreground block">
                          {slot.label}
                        </span>
                        {docObj ? (
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            <p className="font-medium text-foreground truncate max-w-md">
                              {docObj.fileName}
                            </p>
                            <p>
                              Uploaded by {docObj.uploadedBy} on{" "}
                              {new Date(docObj.uploadedAt).toLocaleDateString("en-IN")}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground block">Not Uploaded</span>
                        )}
                        {progress !== undefined && (
                          <div className="w-full max-w-[200px] mt-1.5">
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {docObj && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs gap-1"
                              onClick={() => {
                                const isPdf = docObj.fileName.toLowerCase().endsWith(".pdf");
                                setViewerDoc({ url: docObj.url, name: slot.label, isPdf });
                              }}
                            >
                              <Eye className="size-3.5" /> View
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs gap-1"
                              onClick={() => handleDownloadDocument(docObj.url, docObj.fileName)}
                            >
                              <Download className="size-3.5" /> Download
                            </Button>
                          </>
                        )}
                        <label className="h-8 px-3 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground cursor-pointer flex items-center justify-center text-xs font-semibold gap-1.5 transition-colors">
                          <Upload className="size-3.5" />
                          {docObj ? "Replace" : "Upload"}
                          <input
                            type="file"
                            accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                            onChange={(e) => {
                              const file = e.currentTarget.files?.[0];
                              if (file) handleUploadClientDoc(slot.key, file);
                              e.currentTarget.value = "";
                            }}
                            className="hidden"
                          />
                        </label>
                        {docObj && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            disabled={!isAdmin}
                            title={
                              !isAdmin
                                ? "Only administrators can delete documents"
                                : "Delete document"
                            }
                            onClick={() => handleDeleteClientDoc(docObj)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Vehicles & nested Services section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                  <Car className="size-5 text-primary" />
                  Vehicles ({details.vehicles.length})
                </h3>
                <Button onClick={() => handleOpenVehicleModal()} size="sm">
                  <Plus className="size-4 mr-1" /> Add Vehicle
                </Button>
              </div>

              {details.vehicles.length === 0 ? (
                <div className="text-center py-10 border border-dashed rounded-2xl bg-muted/5">
                  <Car className="size-12 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No vehicles registered. Click Add Vehicle to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {details.vehicles.map((v: any) => (
                    <Card
                      key={v.id}
                      className="border shadow-sm overflow-hidden hover:border-primary/20 transition-all"
                    >
                      <CardHeader className="bg-muted/10 px-5 py-4 border-b flex flex-row items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-lg font-bold tracking-tight text-primary">
                            {v.vehicleNumber}
                          </span>
                          <Badge variant="outline" className="text-xs bg-background">
                            {v.vehicleType}
                          </Badge>
                          <Badge
                            className="text-xs"
                            variant={v.status === "Completed" ? "default" : "secondary"}
                          >
                            {v.status}
                          </Badge>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            onClick={() => handleOpenServiceModal(v.id)}
                            size="sm"
                            variant="outline"
                          >
                            <Plus className="size-3.5 mr-1" /> Add Service
                          </Button>
                          <Button
                            onClick={() => handleOpenVehicleModal(v)}
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            onClick={() => handleDeleteVehicle(v.id)}
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </CardHeader>

                      <CardContent className="p-0">
                        {/* Vehicle extra info cells */}
                        {(v.chassisNumber || v.engineNumber || v.registrationDate) && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 border-b text-xs bg-muted/5">
                            {v.chassisNumber && (
                              <div>
                                <span className="font-bold text-muted-foreground uppercase block text-[9px] tracking-wider mb-0.5">
                                  Chassis Number
                                </span>
                                <span className="font-mono font-medium">{v.chassisNumber}</span>
                              </div>
                            )}
                            {v.engineNumber && (
                              <div>
                                <span className="font-bold text-muted-foreground uppercase block text-[9px] tracking-wider mb-0.5">
                                  Engine Number
                                </span>
                                <span className="font-mono font-medium">{v.engineNumber}</span>
                              </div>
                            )}
                            {v.registrationDate && (
                              <div>
                                <span className="font-bold text-muted-foreground uppercase block text-[9px] tracking-wider mb-0.5">
                                  Reg Date
                                </span>
                                <span>
                                  {new Date(v.registrationDate).toLocaleDateString("en-IN")}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Services List nested under this vehicle */}
                        <div className="divide-y">
                          {v.services.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-6">
                              No services active for this vehicle.
                            </p>
                          ) : (
                            v.services.map((s: Service) => (
                              <div key={s.id} className="p-5 flex flex-col gap-4">
                                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-semibold text-sm">
                                        {serviceLabel(s.serviceType)}
                                      </span>
                                      <Badge variant="outline" className="text-[10px]">
                                        {s.taskStatus}
                                      </Badge>
                                      {s.dueDate && (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                          <Calendar className="size-3" />
                                          Due: {new Date(s.dueDate).toLocaleDateString("en-IN")}
                                        </span>
                                      )}
                                    </div>
                                    {s.notes && (
                                      <p className="text-xs text-muted-foreground mt-1.5 bg-muted/20 p-2 rounded border leading-relaxed">
                                        {s.notes}
                                      </p>
                                    )}
                                  </div>

                                  {/* Service-level accounting numbers */}
                                  <div className="flex items-center gap-4 text-xs font-mono">
                                    <div className="text-right">
                                      <span className="text-[9px] text-muted-foreground block uppercase font-bold">
                                        Amt
                                      </span>
                                      <span className="font-bold text-foreground">
                                        ₹{s.serviceAmount}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-[9px] text-green-700 block uppercase font-bold">
                                        Rec
                                      </span>
                                      <span className="font-bold text-green-600">
                                        ₹{s.amountReceived}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-[9px] text-red-700 block uppercase font-bold">
                                        Pend
                                      </span>
                                      <span className="font-bold text-red-600">
                                        ₹{s.pendingAmount}
                                      </span>
                                    </div>
                                    <div className="flex gap-1 ml-2">
                                      <Button
                                        onClick={() => {
                                          const pdfTypeMap: Record<string, string> = {
                                            Insurance: "insurance",
                                            Fitness: "fitness",
                                            "Gujarat Permit": "gujarat-permit",
                                            "National Permit": "national-permit",
                                            Tax: "tax",
                                            PUC: "puc",
                                            "License Renewal": "license-renew",
                                            "RC Transfer": "rc-transfer",
                                            "HP Termination": "hp-termination",
                                          };
                                          const type = pdfTypeMap[s.serviceType] || "insurance";
                                          generatePDF(
                                            type,
                                            {
                                              policyNumber: s.serviceNo || s.applicationNo || "—",
                                              company: s.companyName || "—",
                                              startDate: s.startDate || "—",
                                              expiryDate: s.dueDate || s.expiryDate || "—",
                                              premiumAmount: s.serviceAmount || 0,
                                              status: s.taskStatus || "—",
                                              assignee: s.assignedTo || "—",
                                              remarks: s.notes || "—",
                                              vehicleNumber: v.vehicleNumber || "—",
                                              inspectionDate: s.startDate || "—",
                                              paymentAmount: s.serviceAmount || 0,
                                              paymentStatus: "Paid",
                                              permitNo: s.serviceNo || "—",
                                              amount: s.serviceAmount || 0,
                                              period: s.period || "—",
                                              paidAmount: s.amountReceived || 0,
                                              pendingAmount: s.pendingAmount || 0,
                                              pucNo: s.serviceNo || "—",
                                              issueDate: s.startDate || "—",
                                              licenseNo: s.serviceNo || "—",
                                              licenseType: s.serviceType || "—",
                                              applicantName: details.name || "—",
                                              applicationNo: s.applicationNo || "—",
                                            },
                                            session?.username || "system",
                                          );
                                        }}
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-red-600 hover:bg-red-50"
                                        title="Generate Service PDF"
                                      >
                                        <Download className="size-3.5" />
                                      </Button>
                                      <Button
                                        onClick={() => handleOpenServiceModal(v.id, s)}
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8"
                                      >
                                        <Pencil className="size-3.5" />
                                      </Button>
                                      <Button
                                        onClick={() => handleDeleteService(s.id)}
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                      >
                                        <Trash2 className="size-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>

                                {/* Interactive task tracking pipeline */}
                                <div className="space-y-2 border-t pt-3">
                                  <div className="flex items-center justify-between text-xs mb-1">
                                    <span className="font-semibold text-muted-foreground">
                                      Pipeline Progression:
                                    </span>
                                    <span className="font-mono text-primary font-bold">
                                      {s.progress}% Complete
                                    </span>
                                  </div>

                                  {/* Progress Bar steps indicator */}
                                  <div className="flex flex-wrap gap-2">
                                    {TASK_STAGES.map((stage) => {
                                      const active = s.taskStatus === stage;
                                      const completedIndex = TASK_STAGES.indexOf(s.taskStatus);
                                      const currentIndex = TASK_STAGES.indexOf(stage);
                                      const done = currentIndex <= completedIndex;

                                      return (
                                        <button
                                          key={stage}
                                          onClick={() => handleUpdateServiceStatus(s, stage)}
                                          className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                                            active
                                              ? "bg-primary text-primary-foreground font-semibold ring-2 ring-primary/30"
                                              : done
                                                ? "bg-green-100 text-green-700 border border-green-200"
                                                : "bg-muted text-muted-foreground hover:bg-muted/80 border border-transparent"
                                          }`}
                                        >
                                          {stage}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Structured Vehicle Documents Section */}
                        <div className="border-t p-5 bg-muted/5 space-y-4">
                          <h4 className="font-semibold text-sm text-foreground flex items-center gap-2 border-b pb-2">
                            <FileText className="size-4 text-primary" />
                            Vehicle Documents
                          </h4>

                          <div className="grid gap-3">
                            {VEHICLE_DOC_SLOTS.map((slot) => {
                              const docObj =
                                vehicleDocs.find(
                                  (d) => d.vehicleId === v.id && d.documentType === slot.key,
                                ) || null;
                              const progress = docProgress[`vehicle-${v.id}-${slot.key}`];
                              return (
                                <div
                                  key={slot.key}
                                  className="p-3 border rounded-lg bg-background flex flex-col sm:flex-row justify-between sm:items-center gap-3 hover:shadow-sm transition-all"
                                >
                                  <div className="space-y-0.5">
                                    <span className="font-semibold text-xs text-foreground block">
                                      {slot.label}
                                    </span>
                                    {docObj ? (
                                      <div className="text-[11px] text-muted-foreground">
                                        <p className="font-medium text-foreground truncate max-w-xs">
                                          {docObj.fileName}
                                        </p>
                                        <p>
                                          Uploaded by {docObj.uploadedBy} on{" "}
                                          {new Date(docObj.uploadedAt).toLocaleDateString("en-IN")}
                                        </p>
                                      </div>
                                    ) : (
                                      <span className="text-[11px] text-muted-foreground block">
                                        Not Uploaded
                                      </span>
                                    )}
                                    {progress !== undefined && (
                                      <div className="w-full max-w-[150px] mt-1.5">
                                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                                          <div
                                            className="h-full bg-primary transition-all duration-300"
                                            style={{ width: `${progress}%` }}
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {docObj && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 text-[11px] px-2 gap-1"
                                          onClick={() => {
                                            const isPdf = docObj.fileName
                                              .toLowerCase()
                                              .endsWith(".pdf");
                                            setViewerDoc({
                                              url: docObj.url,
                                              name: `${v.vehicleNumber} - ${slot.label}`,
                                              isPdf,
                                            });
                                          }}
                                        >
                                          <Eye className="size-3" /> View
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 text-[11px] px-2 gap-1"
                                          onClick={() =>
                                            handleDownloadDocument(docObj.url, docObj.fileName)
                                          }
                                        >
                                          <Download className="size-3" /> Download
                                        </Button>
                                      </>
                                    )}
                                    <label className="h-7 px-2.5 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground cursor-pointer flex items-center justify-center text-[11px] font-semibold gap-1 transition-colors">
                                      <Upload className="size-3" />
                                      {docObj ? "Replace" : "Upload"}
                                      <input
                                        type="file"
                                        accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                                        onChange={(e) => {
                                          const file = e.currentTarget.files?.[0];
                                          if (file) handleUploadVehicleDoc(v.id, slot.key, file);
                                          e.currentTarget.value = "";
                                        }}
                                        className="hidden"
                                      />
                                    </label>
                                    {docObj && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                        disabled={!isAdmin}
                                        title={
                                          !isAdmin
                                            ? "Only administrators can delete documents"
                                            : "Delete document"
                                        }
                                        onClick={() => handleDeleteVehicleDoc(docObj)}
                                      >
                                        <Trash2 className="size-3" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Backward Compatibility: Display Legacy Documents if any exist */}
                          {v.documents &&
                            Array.isArray(v.documents) &&
                            v.documents.filter((doc: any) => doc && (doc.fileUrl || doc.url))
                              .length > 0 && (
                              <div className="mt-4 pt-4 border-t border-dashed">
                                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide block mb-2">
                                  Legacy Documents
                                </span>
                                <div className="grid gap-2">
                                  {v.documents
                                    .filter((doc: any) => doc && (doc.fileUrl || doc.url))
                                    .map((doc: any, index: number) => {
                                      const docUrl = doc.fileUrl || doc.url;
                                      const docName = doc.fileName || doc.name || "Document";
                                      const docId = doc.id || `doc-${index}-${docName}`;
                                      const docType =
                                        doc.fileType ||
                                        (docUrl.toLowerCase().includes(".pdf") ? "pdf" : "image");
                                      const storagePath = doc.storagePath || "";

                                      return (
                                        <div
                                          key={docId}
                                          className="flex items-center justify-between p-2.5 border border-dashed rounded-lg bg-background gap-3"
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <FileText className="size-3.5 text-muted-foreground shrink-0" />
                                            <span
                                              className="text-xs truncate text-muted-foreground"
                                              title={docName}
                                            >
                                              {docName}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-7 w-7 hover:bg-muted"
                                              onClick={() =>
                                                setViewerDoc({
                                                  url: docUrl,
                                                  name: docName,
                                                  isPdf: docType === "pdf",
                                                })
                                              }
                                              title="View Document"
                                            >
                                              <Eye className="size-3" />
                                            </Button>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-7 w-7 hover:bg-muted"
                                              onClick={() =>
                                                handleDownloadDocument(docUrl, docName)
                                              }
                                              title="Download Document"
                                            >
                                              <Download className="size-3" />
                                            </Button>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                              onClick={() =>
                                                handleDeleteDocument(v.id, docId, storagePath)
                                              }
                                              title="Delete Document"
                                            >
                                              <Trash2 className="size-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              </div>
                            )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="border-t pt-4">
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>

      {/* Document Preview Modal */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-4">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="truncate">{previewDoc?.name || "Document Preview"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/20 rounded-lg mt-2 relative">
            {previewDoc &&
              (previewDoc.type === "pdf" ? (
                <iframe
                  src={previewDoc?.url || ""}
                  className="w-full h-full border-0 rounded-lg"
                  title={previewDoc?.name || "Document"}
                />
              ) : (
                <img
                  src={previewDoc?.url || ""}
                  alt={previewDoc?.name || "Document"}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-md"
                />
              ))}
          </div>
          <DialogFooter className="pt-2 border-t mt-2 flex justify-between items-center sm:justify-between">
            <span className="text-xs text-muted-foreground">
              Type: {previewDoc?.type?.toUpperCase() || ""}
            </span>
            <Button onClick={() => setPreviewDoc(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Client Profile Modal */}
      <Dialog open={editClientOpen} onOpenChange={setEditClientOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Client Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Client Name</Label>
              <Input
                value={clientForm.name || ""}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Mobile Number</Label>
              <Input
                value={clientForm.mobile || ""}
                onChange={(e) => setClientForm({ ...clientForm, mobile: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Company Name</Label>
              <Input
                value={clientForm.companyName || ""}
                onChange={(e) => setClientForm({ ...clientForm, companyName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">GST Number</Label>
              <Input
                value={clientForm.gstNumber || ""}
                onChange={(e) => setClientForm({ ...clientForm, gstNumber: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">C/O Address</Label>
              <Textarea
                value={clientForm.address || ""}
                onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Internal Notes</Label>
              <Textarea
                value={clientForm.notes || ""}
                onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Record Type</Label>
              <Select
                value={clientForm.type || "client"}
                onValueChange={(v: any) => setClientForm({ ...clientForm, type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditClientOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveClient}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Vehicle Modal */}
      <Dialog open={vehicleModalOpen} onOpenChange={setVehicleModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingVehicle ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Vehicle Number</Label>
              <Input
                value={vehicleForm.vehicleNumber || ""}
                onChange={(e) =>
                  setVehicleForm({ ...vehicleForm, vehicleNumber: e.target.value.toUpperCase() })
                }
                placeholder="e.g. MH12AB1234"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Vehicle Type</Label>
              <Input
                value={vehicleForm.vehicleType || ""}
                onChange={(e) => setVehicleForm({ ...vehicleForm, vehicleType: e.target.value })}
                placeholder="e.g. Commercial, Commercial Trailer, Private"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Chassis Number</Label>
              <Input
                value={vehicleForm.chassisNumber || ""}
                onChange={(e) => setVehicleForm({ ...vehicleForm, chassisNumber: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Engine Number</Label>
              <Input
                value={vehicleForm.engineNumber || ""}
                onChange={(e) => setVehicleForm({ ...vehicleForm, engineNumber: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Registration Date</Label>
              <Input
                type="date"
                value={vehicleForm.registrationDate || ""}
                onChange={(e) =>
                  setVehicleForm({ ...vehicleForm, registrationDate: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Status</Label>
              <Select
                value={vehicleForm.status || "Pending"}
                onValueChange={(v: any) => setVehicleForm({ ...vehicleForm, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="On Hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVehicleModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveVehicle}>Save Vehicle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Service Modal */}
      <Dialog open={serviceModalOpen} onOpenChange={setServiceModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingService ? "Edit Service" : "Add Service"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3 font-sans">
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Service Type</Label>
              <Select
                value={serviceForm.serviceType || "Insurance"}
                onValueChange={(v: any) => setServiceForm({ ...serviceForm, serviceType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {serviceLabel(st)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Due Date</Label>
              <Input
                type="date"
                value={serviceForm.dueDate || ""}
                onChange={(e) => setServiceForm({ ...serviceForm, dueDate: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-bold uppercase">Service Amount</Label>
                <Input
                  type="number"
                  value={serviceForm.serviceAmount ?? ""}
                  onChange={(e) =>
                    setServiceForm({ ...serviceForm, serviceAmount: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold uppercase">Amount Received</Label>
                <Input
                  type="number"
                  value={serviceForm.amountReceived ?? ""}
                  onChange={(e) =>
                    setServiceForm({ ...serviceForm, amountReceived: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Assigned Staff</Label>
              <Select
                value={serviceForm.assignedStaff || "__none"}
                onValueChange={(v: any) =>
                  setServiceForm({ ...serviceForm, assignedStaff: v === "__none" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Unassigned</SelectItem>
                  {STAFF_USERS.map((s) => (
                    <SelectItem key={s.username} value={s.username}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Task Status</Label>
              <Select
                value={serviceForm.taskStatus || "Not Started"}
                onValueChange={(v: any) => setServiceForm({ ...serviceForm, taskStatus: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STAGES.map((ts) => (
                    <SelectItem key={ts} value={ts}>
                      {ts}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Service Notes</Label>
              <Textarea
                value={serviceForm.notes || ""}
                onChange={(e) => setServiceForm({ ...serviceForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setServiceModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveService}>Save Service</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Structured Document Viewer Modal */}
      {viewerDoc && (
        <Dialog
          open={!!viewerDoc}
          onOpenChange={(open) => {
            if (!open) {
              setViewerDoc(null);
              setZoom(1);
            }
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col p-6">
            <DialogHeader className="flex flex-row items-center justify-between border-b pb-3 mb-4 flex-wrap gap-2">
              <div>
                <DialogTitle className="text-lg font-bold">
                  {viewerDoc?.name || "Document Viewer"}
                </DialogTitle>
              </div>
              <div className="flex items-center gap-2 pr-6">
                {!viewerDoc?.isPdf && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
                    >
                      Zoom -
                    </Button>
                    <span className="text-xs font-semibold px-2">{Math.round(zoom * 100)}%</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
                    >
                      Zoom +
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  onClick={() =>
                    handleDownloadDocument(viewerDoc?.url || "", viewerDoc?.name || "document")
                  }
                >
                  <Download className="size-4 mr-1.5" />
                  Download
                </Button>
              </div>
            </DialogHeader>
            <div className="flex-1 min-h-[50vh] flex items-center justify-center bg-muted/20 rounded-xl border p-4 overflow-auto">
              {viewerDoc?.isPdf ? (
                <iframe
                  src={`${viewerDoc?.url || ""}#toolbar=0&navpanes=0`}
                  className="w-full h-[65vh] rounded-lg border shadow-inner"
                  title={viewerDoc?.name || "Document"}
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center transition-transform duration-200"
                  style={{ transform: `scale(${zoom})` }}
                >
                  <img
                    src={viewerDoc?.url || ""}
                    alt={viewerDoc?.name || "Document"}
                    className="max-h-[60vh] object-contain rounded-lg shadow-md cursor-zoom-in"
                    onClick={() => {
                      setZoom((z) => (z === 1 ? 1.8 : 1));
                    }}
                  />
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
