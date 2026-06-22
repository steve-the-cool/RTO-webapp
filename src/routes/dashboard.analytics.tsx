import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Target,
  DollarSign,
  BarChart3,
} from "lucide-react";
import { subscribeToRecords, type Bucket, type RegistryRecord } from "@/lib/records";
import {
  useClientBusinessAnalytics,
  useServiceAnalytics,
  useRevenueByService,
  useMonthlyComparison,
  useYearlyComparison,
  useServiceDistribution,
} from "@/hooks/useServiceAnalytics";
import { cn } from "@/lib/utils";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export const Route = createFileRoute("/dashboard/analytics")({
  component: AnalyticsDashboard,
});

function AnalyticsDashboard() {
  const [allRecords, setAllRecords] = useState<RegistryRecord[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<"daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom">("monthly");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  // Subscribe to all buckets
  useEffect(() => {
    const buckets: Bucket[] = ["clients", "leads", "customers"];
    const unsubscribers: Array<() => void> = [];

    const recordsByBucket: { [key in Bucket]: RegistryRecord[] } = {
      clients: [],
      leads: [],
      customers: [],
    };

    buckets.forEach((bucket) => {
      const unsub = subscribeToRecords(bucket, (records) => {
        recordsByBucket[bucket] = records;
        const combined = Object.values(recordsByBucket).flat();
        setAllRecords(combined);
      });
      unsubscribers.push(unsub);
    });

    return () => unsubscribers.forEach((unsub) => unsub());
  }, []);

  const filteredRecords = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;

    const normalize = (value: string) => {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    };

    switch (selectedPeriod) {
      case "daily":
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
        break;
      case "weekly":
        start = new Date(now);
        start.setDate(now.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
        break;
      case "monthly":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case "quarterly": {
        const quarter = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), quarter * 3, 1);
        end = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999);
        break;
      }
      case "yearly":
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      case "custom": {
        start = normalize(customStartDate);
        if (start) start.setHours(0, 0, 0, 0);
        end = normalize(customEndDate);
        if (end) end.setHours(23, 59, 59, 999);
        break;
      }
    }

    return allRecords.filter((record) => {
      const recordDate = new Date(record.date);
      if (isNaN(recordDate.getTime())) return false;
      if (start && recordDate < start) return false;
      if (end && recordDate > end) return false;
      return true;
    });
  }, [allRecords, selectedPeriod, customStartDate, customEndDate]);

  // Calculate analytics
  const metrics = useServiceAnalytics(filteredRecords);
  const revenueByService = useRevenueByService(filteredRecords);
  const monthlyData = useMonthlyComparison(filteredRecords);
  const yearlyData = useYearlyComparison(filteredRecords);
  const serviceDistribution = useServiceDistribution(filteredRecords);
  const clientBusiness = useClientBusinessAnalytics(filteredRecords);

  // Chart colors
  const COLORS = [
    "#3b82f6", // blue
    "#ef4444", // red
    "#10b981", // green
    "#f59e0b", // amber
    "#8b5cf6", // purple
    "#ec4899", // pink
    "#14b8a6", // teal
    "#f97316", // orange
  ];

  const revenueChartConfig: ChartConfig = {
    revenue: {
      label: "Revenue",
      color: "#3b82f6",
    },
    servicesSold: {
      label: "Services Sold",
      color: "#10b981",
    },
  };

  const monthlyChartConfig: ChartConfig = {
    revenue: {
      label: "Revenue",
      color: "#3b82f6",
    },
    collected: {
      label: "Collected",
      color: "#10b981",
    },
  };

  const yearlyChartConfig: ChartConfig = {
    revenue: {
      label: "Revenue",
      color: "#3b82f6",
    },
    collected: {
      label: "Collected",
      color: "#10b981",
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Service Analytics</h2>
        <p className="text-sm text-muted-foreground">Comprehensive service performance and revenue insights</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Services Sold"
          value={metrics.totalServicesSold.toString()}
          icon={Zap}
          color="bg-blue-500/10 text-blue-600"
          subtext="Services sold across all channels"
        />
        <KPICard
          label="Total Revenue"
          value={`₹${metrics.totalRevenue.toLocaleString("en-IN")}`}
          icon={DollarSign}
          color="bg-green-500/10 text-green-600"
          subtext={`Avg: ₹${Math.round(metrics.averageServiceValue).toLocaleString("en-IN")} per service`}
        />
        <KPICard
          label="Most Sold Service"
          value={metrics.mostSoldService?.service || "—"}
          icon={TrendingUp}
          color="bg-purple-500/10 text-purple-600"
          subtext={metrics.mostSoldService ? `${metrics.mostSoldService.count} sold` : "No data"}
        />
        <KPICard
          label="Collection Rate"
          value={`${metrics.collectionRate.toFixed(1)}%`}
          icon={BarChart3}
          color="bg-amber-500/10 text-amber-600"
          subtext="Payment collection efficiency"
        />
      </div>

      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Client Business Analysis</h3>
            <p className="text-sm text-muted-foreground">Filter customer analytics by period and review top clients.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="period" className="text-xs uppercase tracking-wide text-muted-foreground">
                Date range
              </Label>
              <Select value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as any)}>
                <SelectTrigger className="w-full">
                  <SelectValue id="period" placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedPeriod === "custom" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="start-date" className="text-xs uppercase tracking-wide text-muted-foreground">
                    Start date
                  </Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={customStartDate}
                    onChange={(event) => setCustomStartDate(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date" className="text-xs uppercase tracking-wide text-muted-foreground">
                    End date
                  </Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={customEndDate}
                    onChange={(event) => setCustomEndDate(event.target.value)}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 mt-6">
          <KPICard
            label="Clients Active"
            value={clientBusiness.totalClients.toString()}
            icon={Target}
            color="bg-sky-500/10 text-sky-600"
            subtext="Unique clients in this range"
          />
          <KPICard
            label="Services Taken"
            value={clientBusiness.totalServicesTaken.toString()}
            icon={TrendingDown}
            color="bg-emerald-500/10 text-emerald-600"
            subtext="Service interactions recorded"
          />
          <KPICard
            label="Revenue Generated"
            value={`₹${clientBusiness.totalRevenue.toLocaleString("en-IN")}`}
            icon={DollarSign}
            color="bg-lime-500/10 text-lime-600"
            subtext="Total billed to clients"
          />
          <KPICard
            label="Monthly Avg Business"
            value={`₹${Math.round(clientBusiness.averageMonthlyRevenue).toLocaleString("en-IN")}`}
            icon={BarChart3}
            color="bg-violet-500/10 text-violet-600"
            subtext="Average per month in range"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-lg border bg-card p-6">
          <h3 className="font-semibold mb-4">Top Customers by Revenue</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-semibold px-6 py-3 whitespace-nowrap">Client</th>
                  <th className="text-right font-semibold px-6 py-3 whitespace-nowrap">Revenue</th>
                  <th className="text-right font-semibold px-6 py-3 whitespace-nowrap">Services</th>
                  <th className="text-right font-semibold px-6 py-3 whitespace-nowrap">Pending</th>
                </tr>
              </thead>
              <tbody>
                {clientBusiness.topCustomersByRevenue.map((item) => (
                  <tr key={item.clientName} className="border-t hover:bg-muted/30">
                    <td className="px-6 py-3 font-medium">{item.clientName}</td>
                    <td className="px-6 py-3 text-right font-mono">₹{item.revenue.toLocaleString("en-IN")}</td>
                    <td className="px-6 py-3 text-right">{item.serviceCount}</td>
                    <td className="px-6 py-3 text-right font-mono">₹{item.pending.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <h3 className="font-semibold mb-4">Top Customers by Services</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-semibold px-6 py-3 whitespace-nowrap">Client</th>
                  <th className="text-right font-semibold px-6 py-3 whitespace-nowrap">Services</th>
                  <th className="text-right font-semibold px-6 py-3 whitespace-nowrap">Revenue</th>
                  <th className="text-right font-semibold px-6 py-3 whitespace-nowrap">Last Service</th>
                </tr>
              </thead>
              <tbody>
                {clientBusiness.topCustomersByServices.map((item) => (
                  <tr key={item.clientName} className="border-t hover:bg-muted/30">
                    <td className="px-6 py-3 font-medium">{item.clientName}</td>
                    <td className="px-6 py-3 text-right">{item.serviceCount}</td>
                    <td className="px-6 py-3 text-right font-mono">₹{item.revenue.toLocaleString("en-IN")}</td>
                    <td className="px-6 py-3 text-right">{item.lastServiceDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h3 className="font-semibold mb-4">Category Revenue Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-semibold px-6 py-3 whitespace-nowrap">Category</th>
                <th className="text-right font-semibold px-6 py-3 whitespace-nowrap">Revenue</th>
                <th className="text-right font-semibold px-6 py-3 whitespace-nowrap">Services</th>
                <th className="text-right font-semibold px-6 py-3 whitespace-nowrap">Avg Value</th>
              </tr>
            </thead>
            <tbody>
              {clientBusiness.categoryBreakdown.map((item) => (
                <tr key={item.service} className="border-t hover:bg-muted/30">
                  <td className="px-6 py-3 font-medium">{item.service}</td>
                  <td className="px-6 py-3 text-right font-mono">₹{item.revenue.toLocaleString("en-IN")}</td>
                  <td className="px-6 py-3 text-right">{item.servicesSold}</td>
                  <td className="px-6 py-3 text-right font-mono">₹{Math.round(item.averageValue).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts Grid - Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Service */}
        <div className="rounded-lg border bg-card p-6">
          <h3 className="font-semibold mb-4">Revenue by Service</h3>
          {revenueByService.length > 0 ? (
            <ChartContainer config={revenueChartConfig} className="h-80">
              <BarChart data={revenueByService}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="service" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value: any) => {
                        if (typeof value === "number") {
                          return `₹${value.toLocaleString("en-IN")}`;
                        }
                        return value;
                      }}
                    />
                  }
                />
                <Bar dataKey="revenue" fill="var(--color-revenue)" name="Revenue" />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="h-80 flex items-center justify-center text-muted-foreground">
              No data available
            </div>
          )}
        </div>

        {/* Service Distribution Pie Chart */}
        <div className="rounded-lg border bg-card p-6">
          <h3 className="font-semibold mb-4">Service Distribution</h3>
          {serviceDistribution.length > 0 ? (
            <div className="h-80 flex items-center justify-center">
              <PieChart width={300} height={300}>
                <Pie
                  data={serviceDistribution}
                  cx={150}
                  cy={140}
                  labelLine={false}
                  label={({ service, percentage }) => `${service}: ${percentage.toFixed(1)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {serviceDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => {
                    if (typeof value === "number") {
                      return `${value} services`;
                    }
                    return value;
                  }}
                />
              </PieChart>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center text-muted-foreground">
              No data available
            </div>
          )}
        </div>
      </div>

      {/* Monthly Comparison */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="font-semibold mb-4">Monthly Comparison (Last 12 Months)</h3>
        {monthlyData.length > 0 ? (
          <ChartContainer config={monthlyChartConfig} className="h-80">
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip
                content={
                  <ChartTooltipContent
                    formatter={(value: any) => {
                      if (typeof value === "number") {
                        return `₹${value.toLocaleString("en-IN")}`;
                      }
                      return value;
                    }}
                  />
                }
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="revenue"
                stroke="var(--color-revenue)"
                name="Revenue"
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="collected"
                stroke="var(--color-collected)"
                name="Collected"
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <div className="h-80 flex items-center justify-center text-muted-foreground">
            No data available
          </div>
        )}
      </div>

      {/* Yearly Comparison */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="font-semibold mb-4">Yearly Comparison</h3>
        {yearlyData.length > 0 ? (
          <ChartContainer config={yearlyChartConfig} className="h-80">
            <BarChart data={yearlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis />
              <Tooltip
                content={
                  <ChartTooltipContent
                    formatter={(value: any) => {
                      if (typeof value === "number") {
                        return `₹${value.toLocaleString("en-IN")}`;
                      }
                      return value;
                    }}
                  />
                }
              />
              <Legend />
              <Bar dataKey="revenue" fill="var(--color-revenue)" name="Revenue" />
              <Bar dataKey="collected" fill="var(--color-collected)" name="Collected" />
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="h-80 flex items-center justify-center text-muted-foreground">
            No data available
          </div>
        )}
      </div>

      {/* Service Details Table */}
      {revenueByService.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="border-b bg-muted/60 px-6 py-3">
            <h3 className="font-semibold">Service Performance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-semibold px-6 py-3 whitespace-nowrap">Service</th>
                  <th className="text-right font-semibold px-6 py-3 whitespace-nowrap">Count</th>
                  <th className="text-right font-semibold px-6 py-3 whitespace-nowrap">Revenue</th>
                  <th className="text-right font-semibold px-6 py-3 whitespace-nowrap">Avg Value</th>
                  <th className="text-right font-semibold px-6 py-3 whitespace-nowrap">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {revenueByService.map((item, idx) => {
                  const percentage = ((item.servicesSold / metrics.totalServicesSold) * 100).toFixed(1);
                  return (
                    <tr key={idx} className="border-t hover:bg-muted/30">
                      <td className="px-6 py-3 font-medium">{item.service}</td>
                      <td className="px-6 py-3 text-right">{item.servicesSold}</td>
                      <td className="px-6 py-3 text-right font-mono">
                        ₹{item.revenue.toLocaleString("en-IN")}
                      </td>
                      <td className="px-6 py-3 text-right font-mono">
                        ₹{Math.round(item.averageValue).toLocaleString("en-IN")}
                      </td>
                      <td className="px-6 py-3 text-right">{percentage}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function KPICard({
  label,
  value,
  icon: Icon,
  color,
  subtext,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  subtext: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{subtext}</p>
        </div>
        <div className={cn("rounded-lg p-2", color)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
