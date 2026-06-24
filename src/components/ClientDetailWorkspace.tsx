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
} from "@/lib/hierarchy";
import { SERVICE_TYPES, serviceLabel, STAFF_USERS } from "@/lib/records";
import { toast } from "sonner";
import { WhatsAppQuickActions } from "./WhatsAppQuickActions";

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
    if (!details) return;
    setClientForm(details);
    setEditClientOpen(true);
  };

  const handleSaveClient = async () => {
    try {
      await saveClient(clientForm as Client);
      setEditClientOpen(false);
      toast.success("Client profile updated successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save client profile.");
    }
  };

  // Handle Vehicle Save / Delete
  const handleOpenVehicleModal = (v?: Vehicle) => {
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
    if (!vehicleForm.vehicleNumber?.trim()) {
      toast.error("Vehicle Number is required");
      return;
    }
    try {
      await saveVehicle(vehicleForm as Vehicle);
      setVehicleModalOpen(false);
      toast.success(editingVehicle ? "Vehicle updated!" : "Vehicle added!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save vehicle.");
    }
  };

  const handleDeleteVehicle = async (vId: string) => {
    if (!confirm("Are you sure you want to delete this vehicle and all associated services?")) {
      return;
    }
    try {
      await deleteVehicle(vId);
      toast.success("Vehicle deleted successfully.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete vehicle.");
    }
  };

  // Handle Service Save / Delete
  const handleOpenServiceModal = (vehicleId: string, s?: Service) => {
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
    try {
      await saveService(serviceForm as Service);
      setServiceModalOpen(false);
      toast.success(editingService ? "Service updated!" : "Service added!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save service.");
    }
  };

  const handleDeleteService = async (sId: string) => {
    if (!confirm("Are you sure you want to delete this service?")) {
      return;
    }
    try {
      await deleteService(sId);
      toast.success("Service deleted.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete service.");
    }
  };

  // Update Service Status directly (stepper)
  const handleUpdateServiceStatus = async (service: Service, status: ServiceTaskStatus) => {
    try {
      await saveService({
        ...service,
        taskStatus: status,
      });
      toast.success(`Service status updated to ${status}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update status.");
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
                <Badge variant={details.type === "lead" ? "secondary" : "default"} className="capitalize">
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
              <WhatsAppQuickActions mobile={details.mobile} name={details.name} />
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
                      <p className="text-xs text-muted-foreground leading-normal mt-1">{details.notes}</p>
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
                <CardContent className="grid grid-cols-3 gap-4 pt-2">
                  <div className="p-3 border rounded-xl bg-background shadow-sm">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Total Bill</span>
                    <p className="text-xl font-bold mt-1 text-foreground">₹{details.accounting.totalAmount.toLocaleString("en-IN")}</p>
                  </div>
                  <div className="p-3 border rounded-xl bg-background shadow-sm">
                    <span className="text-[10px] text-green-700 uppercase font-bold">Received</span>
                    <p className="text-xl font-bold mt-1 text-green-600">₹{details.accounting.amountReceived.toLocaleString("en-IN")}</p>
                  </div>
                  <div className="p-3 border rounded-xl bg-background shadow-sm">
                    <span className="text-[10px] text-red-700 uppercase font-bold">Pending</span>
                    <p className="text-xl font-bold mt-1 text-red-600">₹{details.accounting.pendingAmount.toLocaleString("en-IN")}</p>
                  </div>
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
                    <div key={t.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 border rounded-lg bg-card gap-2">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="font-mono text-xs">{t.vehicleNumber}</Badge>
                        <span className="font-semibold text-sm">{serviceLabel(t.serviceType)}</span>
                        <Badge variant="secondary" className="text-[10px]">{t.taskStatus}</Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col text-right">
                          <span className="text-xs font-semibold text-foreground">{t.progress}% Progress</span>
                          {t.dueDate && <span className="text-[10px] text-muted-foreground mt-0.5">Due: {new Date(t.dueDate).toLocaleDateString("en-IN")}</span>}
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
                  <p className="text-sm text-muted-foreground">No vehicles registered. Click Add Vehicle to get started.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {details.vehicles.map((v: any) => (
                    <Card key={v.id} className="border shadow-sm overflow-hidden hover:border-primary/20 transition-all">
                      <CardHeader className="bg-muted/10 px-5 py-4 border-b flex flex-row items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-lg font-bold tracking-tight text-primary">{v.vehicleNumber}</span>
                          <Badge variant="outline" className="text-xs bg-background">{v.vehicleType}</Badge>
                          <Badge className="text-xs" variant={v.status === "Completed" ? "default" : "secondary"}>
                            {v.status}
                          </Badge>
                        </div>
                        <div className="flex gap-1.5">
                          <Button onClick={() => handleOpenServiceModal(v.id)} size="sm" variant="outline">
                            <Plus className="size-3.5 mr-1" /> Add Service
                          </Button>
                          <Button onClick={() => handleOpenVehicleModal(v)} size="icon" variant="ghost" className="h-8 w-8">
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button onClick={() => handleDeleteVehicle(v.id)} size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10">
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
                                <span className="font-bold text-muted-foreground uppercase block text-[9px] tracking-wider mb-0.5">Chassis Number</span>
                                <span className="font-mono font-medium">{v.chassisNumber}</span>
                              </div>
                            )}
                            {v.engineNumber && (
                              <div>
                                <span className="font-bold text-muted-foreground uppercase block text-[9px] tracking-wider mb-0.5">Engine Number</span>
                                <span className="font-mono font-medium">{v.engineNumber}</span>
                              </div>
                            )}
                            {v.registrationDate && (
                              <div>
                                <span className="font-bold text-muted-foreground uppercase block text-[9px] tracking-wider mb-0.5">Reg Date</span>
                                <span>{new Date(v.registrationDate).toLocaleDateString("en-IN")}</span>
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
                                      <span className="font-semibold text-sm">{serviceLabel(s.serviceType)}</span>
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
                                      <span className="text-[9px] text-muted-foreground block uppercase font-bold">Amt</span>
                                      <span className="font-bold text-foreground">₹{s.serviceAmount}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-[9px] text-green-700 block uppercase font-bold">Rec</span>
                                      <span className="font-bold text-green-600">₹{s.amountReceived}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-[9px] text-red-700 block uppercase font-bold">Pend</span>
                                      <span className="font-bold text-red-600">₹{s.pendingAmount}</span>
                                    </div>
                                    <div className="flex gap-1 ml-2">
                                      <Button onClick={() => handleOpenServiceModal(v.id, s)} size="icon" variant="ghost" className="h-8 w-8">
                                        <Pencil className="size-3.5" />
                                      </Button>
                                      <Button onClick={() => handleDeleteService(s.id)} size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                                        <Trash2 className="size-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>

                                {/* Interactive task tracking pipeline */}
                                <div className="space-y-2 border-t pt-3">
                                  <div className="flex items-center justify-between text-xs mb-1">
                                    <span className="font-semibold text-muted-foreground">Pipeline Progression:</span>
                                    <span className="font-mono text-primary font-bold">{s.progress}% Complete</span>
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
            <Button variant="outline" onClick={() => setEditClientOpen(false)}>Cancel</Button>
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
                onChange={(e) => setVehicleForm({ ...vehicleForm, vehicleNumber: e.target.value.toUpperCase() })}
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
                onChange={(e) => setVehicleForm({ ...vehicleForm, registrationDate: e.target.value })}
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
            <Button variant="outline" onClick={() => setVehicleModalOpen(false)}>Cancel</Button>
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
                  onChange={(e) => setServiceForm({ ...serviceForm, serviceAmount: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold uppercase">Amount Received</Label>
                <Input
                  type="number"
                  value={serviceForm.amountReceived ?? ""}
                  onChange={(e) => setServiceForm({ ...serviceForm, amountReceived: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Assigned Staff</Label>
              <Select
                value={serviceForm.assignedStaff || "__none"}
                onValueChange={(v: any) => setServiceForm({ ...serviceForm, assignedStaff: v === "__none" ? "" : v })}
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
            <Button variant="outline" onClick={() => setServiceModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveService}>Save Service</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
