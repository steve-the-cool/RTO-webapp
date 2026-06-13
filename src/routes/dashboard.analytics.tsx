import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

  // Calculate analytics
  const metrics = useServiceAnalytics(allRecords);
  const revenueByService = useRevenueByService(allRecords);
  const monthlyData = useMonthlyComparison(allRecords);
  const yearlyData = useYearlyComparison(allRecords);
  const serviceDistribution = useServiceDistribution(allRecords);

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
