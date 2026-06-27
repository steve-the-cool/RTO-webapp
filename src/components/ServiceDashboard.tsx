import { useEffect, useState } from "react";
import {
  getServiceClientsAll,
  getServiceStats,
  getServiceDistributionSummary,
} from "@/lib/services";
import {
  serviceLabel,
  type ServiceType,
  type RegistryRecord,
  getRecordServices,
  getRecordServiceAmount,
  getRecordPendingAmount,
  getRecordPaymentStatus,
  getRecordServiceDetails,
  hasLegacyAccounting,
} from "@/lib/records";
import { RecordTable } from "@/components/RecordTable";
import { ClientDetailWorkspace } from "./ClientDetailWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import {
  Users,
  TrendingUp,
  Package,
  AlertCircle,
  DollarSign,
  ArrowRight,
  Download,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { generateServicePDF } from "@/lib/pdfServiceHelper";

interface ServiceDashboardProps {
  serviceType: ServiceType;
  title?: string;
  description?: string;
}

function aggregateServiceRecords(recs: RegistryRecord[], serviceType: ServiceType) {
  const clientGroups: { [clientId: string]: RegistryRecord[] } = {};
  for (const r of recs) {
    if (!clientGroups[r.id]) {
      clientGroups[r.id] = [];
    }
    clientGroups[r.id].push(r);
  }

  const aggregatedRecords: any[] = [];
  let index = 1;

  let uniqueVehicles = new Set<string>();

  // Status counts for services
  let serviceActiveCount = 0;
  let serviceCompletedCount = 0;
  let servicePendingCount = 0;
  let serviceOnHoldCount = 0;

  for (const clientId in clientGroups) {
    const group = clientGroups[clientId];
    const first = group[0];

    const vehicleNumbers = Array.from(new Set(group.map((r) => r.mvNo).filter(Boolean)));
    vehicleNumbers.forEach((v) => uniqueVehicles.add(v));

    const servicesList = group.flatMap((r) => r.services || []);

    for (const s of servicesList) {
      // Count service statuses
      const status = s.status || "Pending";
      if (status === "Completed") {
        serviceCompletedCount++;
      } else if (
        status === "In Progress" ||
        status === "Documents Collected" ||
        status === "Verification" ||
        status === "Submitted" ||
        status === "Approved" ||
        status === "Active"
      ) {
        serviceActiveCount++;
      } else if (status === "On Hold") {
        serviceOnHoldCount++;
      } else {
        servicePendingCount++;
      }
    }

    // Determine aggregated status
    let aggStatus = "Pending";
    const statuses = servicesList.map((s) => s.status || "Pending");
    if (statuses.every((s) => s === "Completed")) {
      aggStatus = "Completed";
    } else if (
      statuses.some((s) =>
        [
          "In Progress",
          "Active",
          "Submitted",
          "Approved",
          "Verification",
          "Documents Collected",
        ].includes(s),
      )
    ) {
      aggStatus = "In Progress";
    } else if (statuses.some((s) => s === "On Hold")) {
      aggStatus = "On Hold";
    }

    // Determine earliest due date
    const dueDates = servicesList.map((s) => s.dueDate).filter(Boolean);
    const earliestDueDate =
      dueDates.length > 0
        ? dueDates.reduce((earliest, current) => {
            return new Date(current) < new Date(earliest) ? current : earliest;
          })
        : "";

    aggregatedRecords.push({
      ...first,
      srNo: index++,
      mvNo: vehicleNumbers.join(", "),
      vehicleCount: vehicleNumbers.length,
      serviceCount: servicesList.length,
      status: aggStatus,
      serviceDueDate: earliestDueDate,
      services: servicesList,
      aggregatedVehicles: vehicleNumbers,
    });
  }

  // Compute service-specific aggregates
  let serviceTotal = 0;
  let receivedTotal = 0;
  for (const r of recs) {
    const details = getRecordServiceDetails(r);
    const matching = details.find((s) => s.serviceType === serviceType);
    if (matching) {
      serviceTotal += matching.price ?? 0;
      receivedTotal += matching.amountReceived ?? 0;
    }
  }

  return {
    aggregatedRecords,
    stats: {
      total: Object.keys(clientGroups).length, // unique clients
      active: serviceActiveCount,
      completed: serviceCompletedCount,
      pending: servicePendingCount,
      onHold: serviceOnHoldCount,
      vehicleCount: uniqueVehicles.size,
      serviceCount: recs.length,
    },
    serviceTotal,
    receivedTotal,
    pendingTotal: Math.max(0, serviceTotal - receivedTotal),
  };
}

export function ServiceDashboard({ serviceType }: ServiceDashboardProps) {
  const [records, setRecords] = useState<RegistryRecord[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    completed: 0,
    pending: 0,
    onHold: 0,
    vehicleCount: 0,
    serviceCount: 0,
  });
  const [totalServiceAmount, setTotalServiceAmount] = useState(0);
  const [totalReceived, setTotalReceived] = useState(0);
  const [totalPending, setTotalPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<RegistryRecord | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [diagOutput, setDiagOutput] = useState<string | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});

  const openWorkflow = (record: RegistryRecord) => {
    setSelectedRecord(record);
    setProfileOpen(true);
  };

  const toggleExpand = (clientId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedClients((prev) => ({
      ...prev,
      [clientId]: !prev[clientId],
    }));
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        console.log(`[ServiceDashboard] LOADING: serviceType="${serviceType}"`);

        const [recs] = await Promise.all([getServiceClientsAll(serviceType)]);

        console.log(`[ServiceDashboard] LOADED: ${recs.length} records for "${serviceType}"`, {
          serviceType,
          totalRecords: recs.length,
        });

        const agg = aggregateServiceRecords(recs, serviceType);

        setRecords(agg.aggregatedRecords);
        setStats(agg.stats);
        setTotalServiceAmount(agg.serviceTotal);
        setTotalReceived(agg.receivedTotal);
        setTotalPending(agg.pendingTotal);
      } catch (error) {
        console.error(`[ServiceDashboard] ERROR loading service data for "${serviceType}":`, error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [serviceType]);

  const handleExportServicePDF = async () => {
    try {
      const data = {
        records,
        stats,
        totals: {
          totalServiceAmount,
          totalReceived,
          totalPending,
        },
      };
      await generateServicePDF(serviceType, data, "user");
      console.log("Service PDF export triggered");
    } catch (error) {
      console.error("Error exporting service PDF:", error);
    }
  };

  const statCards = [
    {
      label: "Total Clients",
      value: stats.total,
      icon: Users,
      color: "bg-blue-500/10 text-blue-600",
      description: `${stats.vehicleCount} Vehicles • ${stats.serviceCount} Services`,
    },
    {
      label: "Active Cases",
      value: stats.active,
      icon: TrendingUp,
      color: "bg-green-500/10 text-green-600",
      description: "Services in progress",
    },
    {
      label: "Completed",
      value: stats.completed,
      icon: Package,
      color: "bg-purple-500/10 text-purple-600",
      description: "Services completed",
    },
    {
      label: "Pending",
      value: stats.pending,
      icon: DollarSign,
      color: "bg-yellow-500/10 text-yellow-600",
      description: "Services pending",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            {serviceLabel(serviceType)}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage all {serviceType.toLowerCase()} service requests and renewals.
          </p>
        </div>
        <Link to="/dashboard/clients" className="inline-flex">
          <Button variant="outline">
            {" "}
            <ArrowRight className="size-4 mr-2" /> All Clients{" "}
          </Button>
        </Link>
        <Button
          onClick={handleExportServicePDF}
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
        >
          <Download className="size-4" /> Export PDF
        </Button>
      </div>

      {/* Legacy Accounting warning banner */}
      {records.some(hasLegacyAccounting) && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 flex gap-3">
          <AlertCircle className="size-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-900">
              Legacy accounting detected. Please migrate client to service-wise accounting.
            </p>
          </div>
        </div>
      )}

      {/* Statistics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
              <div className={`rounded-lg p-2 ${card.color}`}>
                <card.icon className="size-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              {card.description && (
                <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totalServiceAmount.toLocaleString("en-IN")}</div>
            <p className="text-xs text-muted-foreground mt-1">
              From {stats.serviceCount} {serviceType} services
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Amount Received</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ₹{totalReceived.toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalServiceAmount > 0
                ? `${((totalReceived / totalServiceAmount) * 100).toFixed(1)}% collected`
                : "No revenue yet"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Amount</CardTitle>
            <Package className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              ₹{totalPending.toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalServiceAmount > 0
                ? `${((totalPending / totalServiceAmount) * 100).toFixed(1)}% pending`
                : "No pending amounts"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Client Table */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Clients</h3>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading clients...</p>
          </div>
        ) : records.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8 gap-4">
              <Package className="size-12 text-muted-foreground/50 mb-2" />
              <p className="text-muted-foreground">
                No clients found for {serviceType.toLowerCase()}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    setDiagRunning(true);
                    setDiagOutput(null);
                    try {
                      const recs = await getServiceClientsAll(serviceType);
                      const summary = await getServiceDistributionSummary();

                      const agg = aggregateServiceRecords(recs, serviceType);

                      setRecords(agg.aggregatedRecords);
                      setStats(agg.stats);
                      setTotalServiceAmount(agg.serviceTotal);
                      setTotalReceived(agg.receivedTotal);
                      setTotalPending(agg.pendingTotal);

                      setDiagOutput(
                        JSON.stringify(
                          {
                            requested: serviceType,
                            found: recs.length,
                            sample: recs
                              .slice(0, 5)
                              .map((r) => ({
                                id: r.id,
                                name: r.name,
                                services: getRecordServices(r),
                              })),
                            summary,
                            stats: agg.stats,
                            revenue: agg.serviceTotal,
                            received: agg.receivedTotal,
                            pending: agg.pendingTotal,
                          },
                          null,
                          2,
                        ),
                      );
                    } catch (err) {
                      setDiagOutput(String(err));
                    } finally {
                      setDiagRunning(false);
                    }
                  }}
                >
                  {diagRunning ? "Running..." : "Run diagnostics"}
                </Button>
                <Button variant="ghost" onClick={() => setDiagOutput(null)}>
                  Clear
                </Button>
              </div>
              {diagOutput ? (
                <pre className="text-xs mt-4 max-h-56 overflow-auto w-full bg-slate-50 p-3 rounded text-left">
                  {diagOutput}
                </pre>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-3"></th>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">SR NO</th>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">NAME</th>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">
                      VEHICLES
                    </th>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">
                      SERVICES
                    </th>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">STATUS</th>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">
                      DUE DATE
                    </th>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">
                      SERVICE AMOUNT
                    </th>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">
                      RECEIVED
                    </th>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">PENDING</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const details = getRecordServiceDetails(r);
                    const matchingServices = details.filter((s) => s.serviceType === serviceType);
                    const servicePrice = matchingServices.reduce(
                      (sum, s) => sum + (s.price ?? 0),
                      0,
                    );
                    const serviceReceived = matchingServices.reduce(
                      (sum, s) => sum + (s.amountReceived ?? 0),
                      0,
                    );
                    const servicePending = Math.max(0, servicePrice - serviceReceived);

                    const serviceStatus = (r as any).status || "Pending";
                    const serviceDueDate = (r as any).serviceDueDate;

                    const vehicleCount = (r as any).vehicleCount ?? 1;
                    const serviceCount = (r as any).serviceCount ?? 1;
                    const vehiclesList = (r as any).aggregatedVehicles || [];

                    return (
                      <>
                        <tr
                          key={r.id}
                          className="border-t hover:bg-muted/30 cursor-pointer"
                          onClick={() => openWorkflow(r)}
                        >
                          <td
                            className="px-3 py-3 text-center"
                            onClick={(e) => toggleExpand(r.id, e)}
                          >
                            {expandedClients[r.id] ? (
                              <ChevronDown className="size-4 text-muted-foreground mx-auto hover:text-foreground cursor-pointer" />
                            ) : (
                              <ChevronRight className="size-4 text-muted-foreground mx-auto hover:text-foreground cursor-pointer" />
                            )}
                          </td>
                          <td className="px-3 py-3 font-medium">{r.srNo}</td>
                          <td className="px-3 py-3 font-medium text-sky-600 underline decoration-dotted underline-offset-2">
                            {r.name}
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-semibold text-xs text-foreground">
                              {vehicleCount} {vehicleCount === 1 ? "Vehicle" : "Vehicles"}
                            </div>
                            {vehiclesList.length > 0 && (
                              <div
                                className="text-[10px] font-mono text-muted-foreground mt-0.5 max-w-[150px] truncate"
                                title={vehiclesList.join(", ")}
                              >
                                {vehiclesList.join(", ")}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-gray-500/10">
                              {serviceCount} {serviceCount === 1 ? "Service" : "Services"}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                                serviceStatus === "Completed"
                                  ? "bg-green-500/15 text-green-700 border-green-500/30"
                                  : serviceStatus === "In Progress" || serviceStatus === "Active"
                                    ? "bg-blue-500/15 text-blue-700 border-blue-500/30"
                                    : "bg-muted text-muted-foreground border-border"
                              }`}
                            >
                              {serviceStatus}
                            </span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs">
                            {serviceDueDate
                              ? new Date(serviceDueDate).toLocaleDateString("en-IN")
                              : "—"}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs">
                            ₹{servicePrice.toLocaleString("en-IN")}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-green-600">
                            ₹{serviceReceived.toLocaleString("en-IN")}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-red-600">
                            ₹{servicePending.toLocaleString("en-IN")}
                          </td>
                        </tr>
                        {expandedClients[r.id] && (
                          <tr className="bg-muted/5 border-t">
                            <td colSpan={10} className="px-6 py-4">
                              <div className="rounded-lg border bg-background overflow-hidden shadow-sm">
                                <table className="w-full text-xs">
                                  <thead className="bg-muted/40 uppercase tracking-wider text-muted-foreground text-[10px] font-semibold">
                                    <tr>
                                      <th className="text-left px-3 py-2">Vehicle Number</th>
                                      <th className="text-left px-3 py-2">Vehicle Type</th>
                                      <th className="text-left px-3 py-2">Status</th>
                                      <th className="text-left px-3 py-2">Due Date</th>
                                      <th className="text-left px-3 py-2">Service Amount</th>
                                      <th className="text-left px-3 py-2">Received</th>
                                      <th className="text-left px-3 py-2">Pending</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {matchingServices.map((s: any, idx: number) => {
                                      const pendingAmt = Math.max(
                                        0,
                                        (s.price ?? 0) - (s.amountReceived ?? 0),
                                      );
                                      return (
                                        <tr
                                          key={s.serviceId || idx}
                                          className="border-t hover:bg-muted/10 font-mono"
                                        >
                                          <td className="px-3 py-2 font-bold text-sky-600">
                                            {s.vehicleNumber || "—"}
                                          </td>
                                          <td className="px-3 py-2 text-muted-foreground font-sans">
                                            {s.vehicleType || "—"}
                                          </td>
                                          <td className="px-3 py-2">
                                            <span
                                              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border font-sans ${
                                                s.status === "Completed"
                                                  ? "bg-green-500/10 text-green-700 border-green-500/20"
                                                  : s.status === "In Progress" ||
                                                      s.status === "Active"
                                                    ? "bg-blue-500/10 text-blue-700 border-blue-500/20"
                                                    : "bg-muted text-muted-foreground"
                                              }`}
                                            >
                                              {s.status}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2">
                                            {s.dueDate
                                              ? new Date(s.dueDate).toLocaleDateString("en-IN")
                                              : "—"}
                                          </td>
                                          <td className="px-3 py-2">
                                            ₹{(s.price ?? 0).toLocaleString("en-IN")}
                                          </td>
                                          <td className="px-3 py-2 text-green-600">
                                            ₹{(s.amountReceived ?? 0).toLocaleString("en-IN")}
                                          </td>
                                          <td className="px-3 py-2 text-red-600">
                                            ₹{pendingAmt.toLocaleString("en-IN")}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {selectedRecord && (
        <ClientDetailWorkspace
          clientId={selectedRecord.id}
          open={profileOpen}
          onOpenChange={setProfileOpen}
        />
      )}
    </div>
  );
}
