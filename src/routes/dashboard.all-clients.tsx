import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  Users,
  UserCheck,
  Clock,
  DollarSign,
  Search,
  Filter,
  Eye,
  Calendar,
  Phone,
  Car,
  AlertCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { subscribeToAllClients, filterClients, type AggregatedClient } from "@/lib/allClients";
import { SERVICE_TYPES, STATUS_OPTIONS, staffLabel } from "@/lib/records";
import { formatActivityTime, getActivityDescription } from "@/lib/activity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ActivityTimeline } from "@/components/ActivityTimeline";

export const Route = createFileRoute("/dashboard/all-clients")({
  component: AllClientsPage,
});

// ─── Main Page ────────────────────────────────────────────────────────────────

function AllClientsPage() {
  const [clients, setClients] = useState<AggregatedClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "Paid" | "Partial" | "Unpaid">("all");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("all");
  const [serviceStatusFilter, setServiceStatusFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [mobileFilter, setMobileFilter] = useState("");
  const [clientNameFilter, setClientNameFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [dueDateStart, setDueDateStart] = useState("");
  const [dueDateEnd, setDueDateEnd] = useState("");
  const [createdStart, setCreatedStart] = useState("");
  const [createdEnd, setCreatedEnd] = useState("");
  const [selectedClient, setSelectedClient] = useState<AggregatedClient | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Subscribe to all clients
  useEffect(() => {
    setIsLoading(true);
    const unsub = subscribeToAllClients((data) => {
      setClients(data);
      setIsLoading(false);
    });
    return unsub;
  }, []);

  // Apply filters
  const filteredClients = useMemo(() => {
    return filterClients(clients, searchQuery, {
      status: statusFilter === "all" ? undefined : statusFilter,
      paymentStatus:
        paymentFilter === "all" ? undefined : (paymentFilter as AggregatedClient["paymentStatus"]),
      serviceType: serviceTypeFilter === "all" ? undefined : serviceTypeFilter,
      serviceStatus: serviceStatusFilter === "all" ? undefined : serviceStatusFilter,
      groupName: groupFilter,
      vehicleNumber: vehicleFilter,
      mobileNumber: mobileFilter,
      clientName: clientNameFilter,
      assignedTo: assignedFilter,
      dueDateStart,
      dueDateEnd,
      createdStart,
      createdEnd,
    });
  }, [
    clients,
    searchQuery,
    statusFilter,
    paymentFilter,
    serviceTypeFilter,
    serviceStatusFilter,
    groupFilter,
    vehicleFilter,
    mobileFilter,
    clientNameFilter,
    assignedFilter,
    dueDateStart,
    dueDateEnd,
    createdStart,
    createdEnd,
  ]);

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalClients = clients.length;
    const activeClients = clients.filter((c) => c.isActive).length;
    const pendingClients = clients.filter((c) => c.pendingServices > 0).length;
    const totalRevenue = clients.reduce((sum, c) => sum + c.totalRevenue, 0);

    return {
      totalClients,
      activeClients,
      pendingClients,
      totalRevenue,
    };
  }, [clients]);

  const handleViewDetails = (client: AggregatedClient) => {
    setSelectedClient(client);
    setShowDetails(true);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">All Clients</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Master view of all clients, leads, and customers with aggregated data
        </p>
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KPICard
              icon={Users}
              label="Total Clients"
              value={metrics.totalClients}
              color="bg-blue-500"
            />
            <KPICard
              icon={UserCheck}
              label="Active Clients"
              value={metrics.activeClients}
              color="bg-green-500"
            />
            <KPICard
              icon={Clock}
              label="Pending Clients"
              value={metrics.pendingClients}
              color="bg-amber-500"
            />
            <KPICard
              icon={DollarSign}
              label="Total Revenue"
              value={`₹${metrics.totalRevenue.toLocaleString("en-IN")}`}
              color="bg-purple-500"
            />
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, mobile, vehicle, or group..."
                className="pl-8"
              />
            </div>

            <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Client Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <Select value={paymentFilter} onValueChange={(val: any) => setPaymentFilter(val)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payment Status</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Partial">Partially Paid</SelectItem>
                <SelectItem value="Unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Select
              value={serviceTypeFilter}
              onValueChange={(val: any) => setServiceTypeFilter(val)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Service Types</SelectItem>
                {SERVICE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={serviceStatusFilter}
              onValueChange={(val: any) => setServiceStatusFilter(val)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              placeholder="Group Name"
            />

            <Input
              value={clientNameFilter}
              onChange={(e) => setClientNameFilter(e.target.value)}
              placeholder="Client Name"
            />

            <Input
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              placeholder="Vehicle Number"
            />

            <Input
              value={mobileFilter}
              onChange={(e) => setMobileFilter(e.target.value)}
              placeholder="Mobile Number"
            />

            <Input
              value={assignedFilter}
              onChange={(e) => setAssignedFilter(e.target.value)}
              placeholder="Employee Assigned"
            />

            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">Due Date From</Label>
              <Input
                type="date"
                value={dueDateStart}
                onChange={(e) => setDueDateStart(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">Due Date To</Label>
              <Input
                type="date"
                value={dueDateEnd}
                onChange={(e) => setDueDateEnd(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">Created From</Label>
              <Input
                type="date"
                value={createdStart}
                onChange={(e) => setCreatedStart(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">Created To</Label>
              <Input
                type="date"
                value={createdEnd}
                onChange={(e) => setCreatedEnd(e.target.value)}
              />
            </div>
          </div>

          {/* Clients Table */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <tr>
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">
                      Client Name
                    </th>
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">Group</th>
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">Mobile</th>
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">
                      Vehicles
                    </th>
                    <th className="text-center font-semibold px-4 py-3 whitespace-nowrap">
                      Services
                    </th>
                    <th className="text-center font-semibold px-4 py-3 whitespace-nowrap">
                      Active
                    </th>
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">
                      Assignee
                    </th>
                    <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">
                      Revenue
                    </th>
                    <th className="text-center font-semibold px-4 py-3 whitespace-nowrap">
                      Payment
                    </th>
                    <th className="text-center font-semibold px-4 py-3 whitespace-nowrap">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                        {clients.length === 0
                          ? "No clients found"
                          : "No clients match your filters"}
                      </td>
                    </tr>
                  ) : (
                    filteredClients.map((client) => (
                      <ClientRow
                        key={client.id}
                        client={client}
                        onView={() => handleViewDetails(client)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Client Details Modal */}
      {selectedClient && (
        <ClientDetailsModal
          client={selectedClient}
          open={showDetails}
          onOpenChange={setShowDetails}
        />
      )}
    </div>
  );
}

// ─── KPI Card Component ────────────────────────────────────────────────────────

interface KPICardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
}

function KPICard({ icon: Icon, label, value, color }: KPICardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <p className="text-2xl font-bold mt-2">{value}</p>
        </div>
        <div className={cn(color, "p-3 rounded-lg text-white")}>
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}

// ─── Client Row Component ──────────────────────────────────────────────────────

interface ClientRowProps {
  client: AggregatedClient;
  onView: () => void;
}

function ClientRow({ client, onView }: ClientRowProps) {
  const paymentStatusColor =
    client.paymentStatus === "Paid"
      ? "bg-green-100 text-green-800 border-green-200"
      : client.paymentStatus === "Partial"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-red-100 text-red-800 border-red-200";

  return (
    <tr className="border-t hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 font-semibold text-foreground">{client.name}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{client.groupName || "—"}</td>
      <td className="px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <Phone className="size-3.5 text-muted-foreground" />
          <a href={`tel:${client.mobile}`} className="hover:underline">
            {client.mobile || "—"}
          </a>
        </div>
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="flex items-center gap-1 flex-wrap">
          {client.vehicles.length > 0 ? (
            client.vehicles.map((v) => (
              <Badge key={v} variant="secondary" className="text-xs">
                {v}
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-center text-sm font-medium">
        <Badge variant="outline">{client.allServices.length}</Badge>
      </td>
      <td className="px-4 py-3 text-center">
        <Badge variant={client.activeServices > 0 ? "default" : "secondary"}>
          {client.activeServices}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {staffLabel(client.assignee) || "—"}
      </td>
      <td className="px-4 py-3 text-right font-medium">
        ₹{client.totalRevenue.toLocaleString("en-IN")}
      </td>
      <td className="px-4 py-3 text-center">
        <Badge className={cn(paymentStatusColor, "border")}>{client.paymentStatus}</Badge>
      </td>
      <td className="px-4 py-3 text-center">
        <Badge variant={client.isActive ? "default" : "secondary"}>
          {client.isActive ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right">
        <Button variant="ghost" size="sm" onClick={onView}>
          <Eye className="size-4" />
        </Button>
      </td>
    </tr>
  );
}

// ─── Client Details Modal ──────────────────────────────────────────────────────

interface ClientDetailsModalProps {
  client: AggregatedClient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ClientDetailsModal({ client, open, onOpenChange }: ClientDetailsModalProps) {
  const [expandedService, setExpandedService] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            {client.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Client Summary */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">Group Name</p>
                <p className="text-sm font-medium">{client.groupName || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">Mobile</p>
                <p className="text-sm font-medium">{client.mobile || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">Email</p>
                <p className="text-sm font-medium">{client.email || "—"}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">Address</p>
                <p className="text-sm font-medium">{client.address || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Assigned Staff
                </p>
                <p className="text-sm font-medium">{staffLabel(client.assignee) || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Last Activity
                </p>
                <p className="text-sm font-medium">{client.lastActivityDate || "—"}</p>
              </div>
            </div>
          </div>

          {/* Vehicles */}
          {client.vehicles.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Vehicles</p>
              <div className="flex flex-wrap gap-2">
                {client.vehicles.map((v) => (
                  <Badge key={v} className="text-sm">
                    <Car className="size-3 mr-1" />
                    {v}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Service Statistics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatBox label="Total Services" value={client.allServices.length} />
            <StatBox label="Active" value={client.activeServices} highlight="bg-blue-500" />
            <StatBox label="Pending" value={client.pendingServices} highlight="bg-amber-500" />
            <StatBox label="Completed" value={client.completedServices} highlight="bg-green-500" />
          </div>

          {/* Revenue Summary */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Total Revenue</p>
              <p className="text-lg font-bold mt-1">
                ₹{client.totalRevenue.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="rounded-lg bg-green-500/10 p-3">
              <p className="text-xs font-semibold text-green-700 uppercase">Amount Received</p>
              <p className="text-lg font-bold mt-1 text-green-700">
                ₹{client.totalReceived.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="rounded-lg bg-red-500/10 p-3">
              <p className="text-xs font-semibold text-red-700 uppercase">Pending Amount</p>
              <p className="text-lg font-bold mt-1 text-red-700">
                ₹{client.pendingRevenue.toLocaleString("en-IN")}
              </p>
            </div>
          </div>

          {/* Services List */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">
              All Services
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {client.allServices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No services found</p>
              ) : (
                client.allServices
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((service) => (
                    <div key={service.id} className="rounded-lg border bg-muted/30 p-3">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() =>
                          setExpandedService(expandedService === service.id ? null : service.id)
                        }
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-sm">{service.work}</p>
                            <Badge variant="secondary" className="text-xs">
                              {service.application}
                            </Badge>
                            <Badge
                              className="text-xs"
                              variant={
                                service.status === "Completed"
                                  ? "default"
                                  : service.status === "In Progress"
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {service.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            <Calendar className="inline size-3 mr-1" />
                            {service.date}
                            {service.serviceAmount && (
                              <>
                                {" • "}
                                <DollarSign className="inline size-3 mr-1" />₹
                                {service.serviceAmount.toLocaleString("en-IN")}
                              </>
                            )}
                          </p>
                        </div>
                        <ChevronDown
                          className={cn(
                            "size-4 text-muted-foreground transition-transform",
                            expandedService === service.id && "rotate-180",
                          )}
                        />
                      </div>

                      {/* Activity Logs */}
                      {expandedService === service.id && service.activityLogs && (
                        <div className="mt-3 pt-3 border-t space-y-2">
                          {service.activityLogs.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No activity logs</p>
                          ) : (
                            service.activityLogs
                              .sort(
                                (a, b) =>
                                  new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
                              )
                              .slice(0, 5)
                              .map((log, idx) => (
                                <div key={idx} className="text-xs text-muted-foreground">
                                  <p>
                                    <span className="font-medium">{log.actor}</span>{" "}
                                    {getActivityDescription(log)} •{" "}
                                    {formatActivityTime(log.timestamp)}
                                  </p>
                                </div>
                              ))
                          )}
                        </div>
                      )}
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Stat Box Component ────────────────────────────────────────────────────────

interface StatBoxProps {
  label: string;
  value: number;
  highlight?: string;
}

function StatBox({ label, value, highlight }: StatBoxProps) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase">{label}</p>
        {highlight && (
          <div className={cn(highlight, "text-white text-sm font-bold px-2 py-1 rounded")}>
            {value}
          </div>
        )}
      </div>
      {!highlight && <p className="text-lg font-bold mt-1">{value}</p>}
    </div>
  );
}
