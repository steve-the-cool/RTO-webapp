import { useEffect, useState } from "react";
import {
  getServiceClientsAll,
  getServiceStats,
  getServiceRevenue,
  getServiceAmountReceived,
  getServicePendingAmount,
} from "@/lib/services";
import { serviceLabel, type ServiceType, type RegistryRecord } from "@/lib/records";
import { RecordTable } from "@/components/RecordTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Package, TrendingUp, DollarSign, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface ServiceDashboardProps {
  serviceType: ServiceType;
}

export function ServiceDashboard({ serviceType }: ServiceDashboardProps) {
  const [records, setRecords] = useState<RegistryRecord[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, completed: 0, pending: 0, onHold: 0 });
  const [revenue, setRevenue] = useState(0);
  const [amountReceived, setAmountReceived] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        console.log(`[ServiceDashboard] LOADING: serviceType="${serviceType}"`);
        
        const [recs, st, rev, recv, pend] = await Promise.all([
          getServiceClientsAll(serviceType),
          getServiceStats(serviceType),
          getServiceRevenue(serviceType),
          getServiceAmountReceived(serviceType),
          getServicePendingAmount(serviceType),
        ]);

        // Validation: Ensure all records have matching serviceType
        const allMatch = recs.every(r => r.serviceType === serviceType);
        const matchCount = recs.filter(r => r.serviceType === serviceType).length;
        
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
              mismatchedRecords: recs.filter(r => r.serviceType !== serviceType).map(r => ({
                id: r.id,
                name: r.name,
                expectedServiceType: serviceType,
                actualServiceType: r.serviceType,
              })),
            },
          );
        }

        // Validation: Ensure stats match record data
        const statusMatch = {
          active: recs.filter(r => r.status === "In Progress").length,
          completed: recs.filter(r => r.status === "Completed").length,
          pending: recs.filter(r => r.status === "Pending").length,
          onHold: recs.filter(r => r.status === "On Hold").length,
        };

        if (st.active !== statusMatch.active || st.completed !== statusMatch.completed) {
          console.warn(`[ServiceDashboard] WARNING: Stats mismatch`, { expected: st, actual: statusMatch });
        }

        setRecords(recs);
        setStats(st);
        setRevenue(rev);
        setAmountReceived(recv);
        setPendingAmount(pend);
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
            <div className="text-2xl font-bold">₹{revenue.toLocaleString("en-IN")}</div>
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
            <div className="text-2xl font-bold text-green-600">₹{amountReceived.toLocaleString("en-IN")}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {revenue > 0 ? `${((amountReceived / revenue) * 100).toFixed(1)}% collected` : "No revenue yet"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Amount</CardTitle>
            <Package className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">₹{pendingAmount.toLocaleString("en-IN")}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {revenue > 0 ? `${((pendingAmount / revenue) * 100).toFixed(1)}% pending` : "No pending amounts"}
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
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Package className="size-12 text-muted-foreground/50 mb-2" />
              <p className="text-muted-foreground">No clients found for {serviceType.toLowerCase()}</p>
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
                  {records.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-3 font-medium">{r.srNo}</td>
                      <td className="px-3 py-3 font-medium">{r.name}</td>
                      <td className="px-3 py-3 font-mono text-xs">{r.mvNo || "—"}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                            r.status === "Completed"
                              ? "bg-green-500/15 text-green-700 border-green-500/30"
                              : r.status === "In Progress"
                                ? "bg-blue-500/15 text-blue-700 border-blue-500/30"
                                : "bg-muted text-muted-foreground border-border"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs">
                        {r.serviceDueDate ? new Date(r.serviceDueDate).toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">
                        ₹{(r.serviceAmount || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-green-600">
                        ₹{(r.amountReceived || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-red-600">
                        ₹{((r.serviceAmount || 0) - (r.amountReceived || 0)).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
