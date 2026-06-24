import { useEffect, useState } from "react";
import {
  getServiceClientsAll,
  getServiceStats,
  getServiceDistributionSummary,
} from "@/lib/services";
import { serviceLabel, type ServiceType, type RegistryRecord, getRecordServices, getRecordServiceAmount, getRecordPendingAmount, getRecordPaymentStatus, getRecordServiceDetails, hasLegacyAccounting } from "@/lib/records";
import { RecordTable } from "@/components/RecordTable";
import ClientProfile from "@/components/ClientProfile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Package, TrendingUp, DollarSign, Users, AlertCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface ServiceDashboardProps {
  serviceType: ServiceType;
}

export function ServiceDashboard({ serviceType }: ServiceDashboardProps) {
  const [records, setRecords] = useState<RegistryRecord[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, completed: 0, pending: 0, onHold: 0 });
  const [totalServiceAmount, setTotalServiceAmount] = useState(0);
  const [totalReceived, setTotalReceived] = useState(0);
  const [totalPending, setTotalPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<RegistryRecord | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [diagOutput, setDiagOutput] = useState<string | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);

  const openWorkflow = (record: RegistryRecord) => {
    setSelectedRecord(record);
    setProfileOpen(true);
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        console.log(`[ServiceDashboard] LOADING: serviceType="${serviceType}"`);
        
        const [recs, st] = await Promise.all([
          getServiceClientsAll(serviceType),
          getServiceStats(serviceType),
        ]);

        // Validation: Ensure all records include the requested service
        const allMatch = recs.every(r => getRecordServices(r).includes(serviceType));
        const matchCount = recs.filter(r => getRecordServices(r).includes(serviceType)).length;
        
        console.log(
          `[ServiceDashboard] LOADED: ${recs.length} records for "${serviceType}"`,
          {
            serviceType,
            totalRecords: recs.length,
            allMatchFilter: allMatch,
            matchingRecords: matchCount,
          },
        );

        if (!allMatch && recs.length > 0) {
          console.warn(
            `[ServiceDashboard] WARNING: Filter mismatch detected!`,
            {
              totalRecords: recs.length,
              matchingRecords: matchCount,
              mismatchedRecords: recs.filter(r => !getRecordServices(r).includes(serviceType)).map(r => ({
                id: r.id,
                name: r.name,
                expectedServiceType: serviceType,
                actualServices: getRecordServices(r),
              })),
            },
          );
        }

        // Validation: Ensure stats match record data
        const statusMatch = {
          active: recs.filter(r => {
            const s = getRecordServiceDetails(r).find(sd => sd.serviceType === serviceType);
            return s?.status === "In Progress" || s?.status === "Active";
          }).length,
          completed: recs.filter(r => {
            const s = getRecordServiceDetails(r).find(sd => sd.serviceType === serviceType);
            return s?.status === "Completed";
          }).length,
          pending: recs.filter(r => {
            const s = getRecordServiceDetails(r).find(sd => sd.serviceType === serviceType);
            return s?.status === "Pending" || !s?.status;
          }).length,
          onHold: recs.filter(r => {
            const s = getRecordServiceDetails(r).find(sd => sd.serviceType === serviceType);
            return s?.status === "On Hold";
          }).length,
        };

        if (st.active !== statusMatch.active || st.completed !== statusMatch.completed) {
          console.warn(`[ServiceDashboard] WARNING: Stats mismatch`, { expected: st, actual: statusMatch });
        }

        setRecords(recs);
        setStats(st);
        // Compute service-specific aggregates
        let serviceTotal = 0;
        let receivedTotal = 0;
        for (const r of recs) {
          const details = getRecordServiceDetails(r);
          const matching = details.find(s => s.serviceType === serviceType);
          if (matching) {
            serviceTotal += matching.price ?? 0;
            receivedTotal += matching.amountReceived ?? 0;
          }
        }
        setTotalServiceAmount(serviceTotal);
        setTotalReceived(receivedTotal);
        const pendingTotal = Math.max(0, serviceTotal - receivedTotal);
        setTotalPending(pendingTotal);
      } catch (error) {
        console.error(`[ServiceDashboard] ERROR loading service data for "${serviceType}":`, error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [serviceType]);

  const statCards = [
    {
      label: "Total Clients",
      value: stats.total,
      icon: Users,
      color: "bg-blue-500/10 text-blue-600",
    },
    {
      label: "Active Cases",
      value: stats.active,
      icon: TrendingUp,
      color: "bg-green-500/10 text-green-600",
    },
    {
      label: "Completed",
      value: stats.completed,
      icon: Package,
      color: "bg-purple-500/10 text-purple-600",
    },
    {
      label: "Pending",
      value: stats.pending,
      icon: DollarSign,
      color: "bg-yellow-500/10 text-yellow-600",
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
            <ArrowRight className="size-4 mr-2" />
            All Clients
          </Button>
        </Link>
      </div>

      {/* Legacy Accounting warning banner */}
      {records.some(hasLegacyAccounting) && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 flex gap-3">
          <AlertCircle className="size-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-900">Legacy accounting detected. Please migrate client to service-wise accounting.</p>
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
              From {stats.total} {serviceType} services
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Amount Received</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">₹{totalReceived.toLocaleString("en-IN")}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalServiceAmount > 0 ? `${((totalReceived / totalServiceAmount) * 100).toFixed(1)}% collected` : "No revenue yet"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Amount</CardTitle>
            <Package className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">₹{totalPending.toLocaleString("en-IN")}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalServiceAmount > 0 ? `${((totalPending / totalServiceAmount) * 100).toFixed(1)}% pending` : "No pending amounts"}
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
                <p className="text-muted-foreground">No clients found for {serviceType.toLowerCase()}</p>
                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      setDiagRunning(true);
                      setDiagOutput(null);
                      try {
                        const recs = await getServiceClientsAll(serviceType);
                        const summary = await getServiceDistributionSummary();

                        // Populate dashboard state so UI updates immediately
                        setRecords(recs);
                        const st = await getServiceStats(serviceType);

                        // Compute service‑specific aggregates for diagnostics
                        let diagServiceTotal = 0;
                        let diagReceivedTotal = 0;
                        for (const r of recs) {
                          const d = getRecordServiceDetails(r);
                          const m = d.find(s => s.serviceType === serviceType);
                          if (m) {
                            diagServiceTotal += m.price ?? 0;
                            diagReceivedTotal += m.amountReceived ?? 0;
                          }
                        }
                        const diagPendingTotal = Math.max(0, diagServiceTotal - diagReceivedTotal);

                        setStats(st);
                        setTotalServiceAmount(diagServiceTotal);
                        setTotalReceived(diagReceivedTotal);
                        setTotalPending(diagPendingTotal);

                        setDiagOutput(JSON.stringify({ requested: serviceType, found: recs.length, sample: recs.slice(0,5).map(r=>({id:r.id,name:r.name,services:getRecordServices(r)})), summary, stats: st, revenue: diagServiceTotal, received: diagReceivedTotal, pending: diagPendingTotal }, null, 2));
                      } catch (err) {
                        setDiagOutput(String(err));
                      } finally {
                        setDiagRunning(false);
                      }
                    }}
                  >
                    {diagRunning ? "Running..." : "Run diagnostics"}
                  </Button>
                  <Button variant="ghost" onClick={() => setDiagOutput(null)}>Clear</Button>
                </div>
                {diagOutput ? (
                  <pre className="text-xs mt-4 max-h-56 overflow-auto w-full bg-slate-50 p-3 rounded text-left">{diagOutput}</pre>
                ) : null}
              </CardContent>
            </Card>
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">SR NO</th>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">NAME</th>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">MV NO</th>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">STATUS</th>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">DUE DATE</th>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">SERVICE AMOUNT</th>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">RECEIVED</th>
                    <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">PENDING</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const details = getRecordServiceDetails(r);
                    const matchingService = details.find(s => s.serviceType === serviceType);
                    const servicePrice = matchingService?.price ?? 0;
                    const serviceReceived = matchingService?.amountReceived ?? 0;
                    const servicePending = Math.max(0, servicePrice - serviceReceived);
                    const serviceStatus = matchingService?.status || "Pending";
                    const serviceDueDate = matchingService?.dueDate;

                    return (
                      <tr key={r.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => openWorkflow(r)}>
                        <td className="px-3 py-3 font-medium">{r.srNo}</td>
                        <td className="px-3 py-3 font-medium text-sky-600 underline decoration-dotted underline-offset-2">{r.name}</td>
                        <td className="px-3 py-3 font-mono text-xs">{r.mvNo || "—"}</td>
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
                          {serviceDueDate ? new Date(serviceDueDate).toLocaleDateString("en-IN") : "—"}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <ClientProfile record={selectedRecord} open={profileOpen} onOpenChange={setProfileOpen} serviceType={serviceType} />
    </div>
  );
}
