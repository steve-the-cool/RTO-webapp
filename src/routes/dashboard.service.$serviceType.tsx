import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Loader2,
  Search,
  Printer,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  subscribeToServiceRecords,
  calculateServiceMetrics,
  normalizeServiceType,
  SERVICE_CONFIGS,
  getStatusColor,
  type ServiceType,
  type ServiceMetrics,
} from "@/lib/serviceFilters";
import { type RegistryRecord, staffLabel } from "@/lib/records";
import { printWindow } from "@/lib/pdfGenerator";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export const Route = createFileRoute("/dashboard/service/$serviceType")({
  component: ServiceDashboard,
});

// ─── Main Component ───────────────────────────────────────────────────────────

function ServiceDashboard() {
  const { serviceType: serviceSlug } = Route.useParams();
  const [records, setRecords] = useState<RegistryRecord[]>([]);
  const [metrics, setMetrics] = useState<ServiceMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RegistryRecord["status"] | "all">("all");

  // Normalize the service type from slug
  const serviceType = normalizeServiceType(serviceSlug);
  const config = serviceType ? SERVICE_CONFIGS[serviceType] : null;

  // Subscribe to records for this service
  useEffect(() => {
    if (!serviceType) return;

    setIsLoading(true);
    const unsub = subscribeToServiceRecords(serviceType, (data) => {
      setRecords(data);
      setMetrics(calculateServiceMetrics(data));
      setIsLoading(false);
    });

    return unsub;
  }, [serviceType]);

  // Apply filters
  const filteredRecords = useMemo(() => {
    let result = records;

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) =>
        [r.mvNo, r.application, r.name, r.mo, r.co, r.groupName].some((v) =>
          (v ?? "").toLowerCase().includes(q),
        ),
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter);
    }

    return result;
  }, [records, searchQuery, statusFilter]);

  // Status distribution for charts
  const statusDistribution = useMemo(() => {
    if (!metrics) return [];
    return [
      { name: "Pending", value: metrics.pending, fill: "#f59e0b" },
      { name: "In Progress", value: metrics.inProgress, fill: "#3b82f6" },
      { name: "Completed", value: metrics.completed, fill: "#10b981" },
      { name: "On Hold", value: metrics.onHold, fill: "#ef4444" },
    ].filter((d) => d.value > 0);
  }, [metrics]);

  // Revenue trend (by date)
  const revenueTrend = useMemo(() => {
    const byDate: { [key: string]: { date: string; revenue: number; count: number } } = {};

    for (const record of records) {
      if (record.serviceAmount) {
        if (!byDate[record.date]) {
          byDate[record.date] = { date: record.date, revenue: 0, count: 0 };
        }
        byDate[record.date].revenue += record.serviceAmount;
        byDate[record.date].count += 1;
      }
    }

    return Object.values(byDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-30); // Last 30 days
  }, [records]);

  if (!config) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="size-12 text-muted-foreground mx-auto mb-2" />
          <p className="text-lg font-semibold">Service not found</p>
          <p className="text-sm text-muted-foreground">Invalid service type</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">{config.icon}</span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{config.label}</h1>
            <p className="text-sm text-muted-foreground">{config.description}</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <KPICard
              label="Total Records"
              value={metrics?.total ?? 0}
              icon={CheckCircle2}
              color="bg-slate-500"
            />
            <KPICard
              label="Pending"
              value={metrics?.pending ?? 0}
              icon={Clock}
              color="bg-amber-500"
              highlight
            />
            <KPICard
              label="In Progress"
              value={metrics?.inProgress ?? 0}
              icon={TrendingUp}
              color="bg-blue-500"
              highlight
            />
            <KPICard
              label="Completed"
              value={metrics?.completed ?? 0}
              icon={CheckCircle2}
              color="bg-green-500"
              highlight
            />
            <KPICard
              label="Revenue"
              value={`₹${(metrics?.totalRevenue ?? 0).toLocaleString("en-IN")}`}
              icon={TrendingUp}
              color="bg-purple-500"
            />
          </div>

          {/* Charts Grid */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Status Distribution */}
            {statusDistribution.length > 0 && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-4">Status Distribution</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={statusDistribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {statusDistribution.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Revenue Metrics */}
            <div className="rounded-lg border bg-card p-4 space-y-4">
              <h3 className="font-semibold">Revenue Metrics</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                  <span className="text-sm text-muted-foreground">Total Revenue</span>
                  <span className="font-bold">
                    ₹{(metrics?.totalRevenue ?? 0).toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-green-500/10">
                  <span className="text-sm text-green-700">Amount Received</span>
                  <span className="font-bold text-green-700">
                    ₹{(metrics?.totalReceived ?? 0).toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-red-500/10">
                  <span className="text-sm text-red-700">Pending Amount</span>
                  <span className="font-bold text-red-700">
                    ₹{(metrics?.pendingAmount ?? 0).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </div>

            {/* Revenue Trend */}
            {revenueTrend.length > 0 && (
              <div className="rounded-lg border bg-card p-4 lg:col-span-2">
                <h3 className="font-semibold mb-4">Revenue Trend (Last 30 Days)</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip
                      formatter={(value) => `₹${typeof value === "number" ? value.toLocaleString("en-IN") : value}`}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Legend />
                    <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Search & Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, vehicle, mobile..."
                className="pl-8"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 border rounded-md bg-background text-sm"
            >
              <option value="all">All Status</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="On Hold">On Hold</option>
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => printWindow()}
            >
              <Printer className="size-4 mr-2" />
              Print / PDF
            </Button>
          </div>

          {/* Records Table */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <tr>
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">
                      Date
                    </th>
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">
                      Vehicle
                    </th>
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">
                      Client Name
                    </th>
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">
                      Application
                    </th>
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">
                      Status
                    </th>
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">
                      Assigned To
                    </th>
                    <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">
                      Amount
                    </th>
                    <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">
                      Received
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                        {records.length === 0
                          ? `No ${config.label.toLowerCase()} records found`
                          : "No records match your filters"}
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((record) => (
                      <tr key={record.id} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-sm">{record.date}</td>
                        <td className="px-4 py-3 text-sm font-medium">{record.mvNo}</td>
                        <td className="px-4 py-3 text-sm">{record.name}</td>
                        <td className="px-4 py-3 text-sm">{record.application}</td>
                        <td className="px-4 py-3">
                          <Badge className={cn(getStatusColor(record.status), "text-xs border")}>
                            {record.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {staffLabel(record.assignee) || "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium">
                          {record.serviceAmount
                            ? `₹${record.serviceAmount.toLocaleString("en-IN")}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium">
                          {record.amountReceived
                            ? `₹${record.amountReceived.toLocaleString("en-IN")}`
                            : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── KPI Card Component ────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  highlight?: boolean;
}

function KPICard({ label, value, icon: Icon, color, highlight }: KPICardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <p className={cn("text-2xl font-bold mt-2", highlight && "text-lg")}>
            {value}
          </p>
        </div>
        <div className={cn(color, "p-3 rounded-lg text-white")}>
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}
