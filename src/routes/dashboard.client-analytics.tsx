import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Car,
  Shield,
  FileText,
  CheckCircle,
  DollarSign,
  Lightbulb,
  Zap,
  BarChart3,
  TrendingUp,
  Search,
  Calendar,
  ArrowUpDown,
  ChevronRight,
  ChevronDown,
  Download,
  AlertCircle,
} from "lucide-react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Client, Vehicle, Service } from "@/lib/hierarchy";
import { serviceLabel } from "@/lib/records";
import { generatePDF } from "@/lib/pdfGenerator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
  ResponsiveContainer,
} from "recharts";

export const Route = createFileRoute("/dashboard/client-analytics")({
  component: ClientAnalyticsDashboard,
});

const COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#64748b"];

const SERVICE_CATEGORIES = [
  "Insurance",
  "Fitness",
  "Tax",
  "PUC",
  "RC Transfer",
  "Gujarat Permit",
  "National Permit",
  "License New",
  "License Renew",
  "Other Services",
];

function ClientAnalyticsDashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [period, setPeriod] = useState<
    "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom" | "all-time"
  >("monthly");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // UI State
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  // Real-time queries
  useEffect(() => {
    setLoading(true);
    const unsubClients = onSnapshot(collection(db, "registry_clients_v2"), (snap) => {
      setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Client));
    });

    const unsubVehicles = onSnapshot(collection(db, "registry_vehicles_v2"), (snap) => {
      setVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Vehicle));
    });

    const unsubServices = onSnapshot(collection(db, "registry_services_v2"), (snap) => {
      setServices(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
          } as Service;
        }),
      );
      setLoading(false);
    });

    return () => {
      unsubClients();
      unsubVehicles();
      unsubServices();
    };
  }, []);

  // Compute active date boundaries
  const dateRange = useMemo(() => {
    const now = new Date();
    let start = new Date(0); // All time start
    let end = new Date(32503680000000); // Far future

    if (period === "daily") {
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
    } else if (period === "weekly") {
      start = new Date(now);
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (period === "monthly") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (period === "quarterly") {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), qStartMonth, 1);
      end = new Date(now.getFullYear(), qStartMonth + 3, 0, 23, 59, 59, 999);
    } else if (period === "yearly") {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 12, 0, 23, 59, 59, 999);
    } else if (period === "custom") {
      if (customStart) {
        start = new Date(customStart);
        start.setHours(0, 0, 0, 0);
      }
      if (customEnd) {
        end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
      }
    }

    return { start, end };
  }, [period, customStart, customEnd]);

  // Aggregate stats per client
  const clientAggregates = useMemo(() => {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    return clients.map((client) => {
      // Find client vehicles
      const clientVehs = vehicles.filter((v) => v.clientId === client.id);
      const vehicleIds = clientVehs.map((v) => v.id);

      // Find services for these vehicles
      const allClientServices = services.filter((s) => vehicleIds.includes(s.vehicleId));

      // Filtered client services inside selected period
      const filteredServices = allClientServices.filter((s) => {
        const sDate = s.createdAt ? new Date(s.createdAt) : new Date();
        return sDate >= dateRange.start && sDate <= dateRange.end;
      });

      // Calculate Revenue using services[].price / serviceAmount
      const totalRevenue = filteredServices.reduce(
        (sum, s) => sum + (s.price ?? s.serviceAmount ?? 0),
        0,
      );
      const totalReceived = filteredServices.reduce((sum, s) => sum + (s.amountReceived ?? 0), 0);
      const pendingAmount = Math.max(0, totalRevenue - totalReceived);

      // Month-wise counts
      const servicesThisMonth = allClientServices.filter((s) => {
        const sDate = s.createdAt ? new Date(s.createdAt) : new Date();
        return sDate >= currentMonthStart && sDate <= now;
      }).length;

      const servicesLastMonth = allClientServices.filter((s) => {
        const sDate = s.createdAt ? new Date(s.createdAt) : new Date();
        return sDate >= lastMonthStart && sDate <= lastMonthEnd;
      }).length;

      // Average monthly business
      const monthlyRevenueMap: Record<string, number> = {};
      allClientServices.forEach((s) => {
        if (!s.createdAt) return;
        const key = s.createdAt.substring(0, 7); // YYYY-MM
        monthlyRevenueMap[key] = (monthlyRevenueMap[key] || 0) + (s.price ?? s.serviceAmount ?? 0);
      });
      const monthKeys = Object.keys(monthlyRevenueMap);
      const averageMonthlyBusiness =
        monthKeys.length > 0
          ? Math.round(
              Object.values(monthlyRevenueMap).reduce((sum, r) => sum + r, 0) / monthKeys.length,
            )
          : 0;

      // Last activity date
      let lastActivityDate = "";
      if (allClientServices.length > 0) {
        const sorted = [...allClientServices].sort((a, b) => {
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });
        if (sorted[0]?.createdAt) {
          lastActivityDate = new Date(sorted[0].createdAt).toLocaleDateString("en-IN");
        }
      }

      // Service breakdown counts
      const serviceBreakdown: Record<string, number> = {};
      SERVICE_CATEGORIES.forEach((cat) => {
        serviceBreakdown[cat] = 0;
      });
      filteredServices.forEach((s) => {
        const label = serviceLabel(s.serviceType);
        if (serviceBreakdown[label] !== undefined) {
          serviceBreakdown[label]++;
        } else {
          serviceBreakdown["Other Services"]++;
        }
      });

      // Monthly growth trend (this month revenue vs last month revenue)
      const revenueThisMonth = allClientServices
        .filter((s) => {
          const sDate = s.createdAt ? new Date(s.createdAt) : new Date();
          return sDate >= currentMonthStart;
        })
        .reduce((sum, s) => sum + (s.price ?? s.serviceAmount ?? 0), 0);

      const revenueLastMonth = allClientServices
        .filter((s) => {
          const sDate = s.createdAt ? new Date(s.createdAt) : new Date();
          return sDate >= lastMonthStart && sDate <= lastMonthEnd;
        })
        .reduce((sum, s) => sum + (s.price ?? s.serviceAmount ?? 0), 0);

      const growthRate =
        revenueLastMonth > 0
          ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100)
          : 0;

      // Vehicle wise stats list
      const vehicleStats = clientVehs.map((v) => {
        const vServices = allClientServices.filter((s) => s.vehicleId === v.id);
        const vFiltered = vServices.filter((s) => {
          const sDate = s.createdAt ? new Date(s.createdAt) : new Date();
          return sDate >= dateRange.start && sDate <= dateRange.end;
        });

        const vRevenue = vFiltered.reduce((sum, s) => sum + (s.price ?? s.serviceAmount ?? 0), 0);
        const vReceived = vFiltered.reduce((sum, s) => sum + (s.amountReceived ?? 0), 0);
        const vPending = Math.max(0, vRevenue - vReceived);

        let vLastDate = "—";
        if (vServices.length > 0) {
          const sorted = [...vServices].sort(
            (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
          );
          if (sorted[0]?.createdAt) {
            vLastDate = new Date(sorted[0].createdAt).toLocaleDateString("en-IN");
          }
        }

        let nextDueDate = "—";
        const upcomingDue = vServices
          .filter((s) => s.dueDate && new Date(s.dueDate) >= now)
          .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        if (upcomingDue[0]?.dueDate) {
          nextDueDate = new Date(upcomingDue[0].dueDate).toLocaleDateString("en-IN");
        }

        return {
          vehicleNumber: v.vehicleNumber,
          vehicleType: v.vehicleType,
          activeServices: vFiltered.map((s) => serviceLabel(s.serviceType)),
          revenue: vRevenue,
          pending: vPending,
          lastServiceDate: vLastDate,
          nextDueDate,
        };
      });

      return {
        id: client.id,
        name: client.name || "Unnamed Client",
        mobile: client.mobile || "",
        companyName: client.companyName || "",
        groupName: client.notes || "", // Group Name or Notes
        totalServices: allClientServices.length,
        filteredServicesCount: filteredServices.length,
        servicesThisMonth,
        servicesLastMonth,
        revenue: totalRevenue,
        received: totalReceived,
        pending: pendingAmount,
        averageMonthlyBusiness,
        totalVehicles: clientVehs.length,
        lastServiceActivityDate: lastActivityDate || "—",
        serviceBreakdown,
        growthRate,
        vehicleStats,
      };
    });
  }, [clients, vehicles, services, dateRange]);

  // Apply search query
  const filteredClientAggregates = useMemo(() => {
    if (!searchQuery.trim()) return clientAggregates;
    const cleanQuery = searchQuery.toLowerCase().trim();

    return clientAggregates.filter((item) => {
      return (
        item.name.toLowerCase().includes(cleanQuery) ||
        item.mobile.toLowerCase().includes(cleanQuery) ||
        item.companyName.toLowerCase().includes(cleanQuery) ||
        item.groupName.toLowerCase().includes(cleanQuery) ||
        item.vehicleStats.some((v) => v.vehicleNumber.toLowerCase().includes(cleanQuery))
      );
    });
  }, [clientAggregates, searchQuery]);

  // Overall aggregate numbers for widgets
  const summaryMetrics = useMemo(() => {
    const totalRevenue = filteredClientAggregates.reduce((sum, c) => sum + c.revenue, 0);
    const totalReceived = filteredClientAggregates.reduce((sum, c) => sum + c.received, 0);
    const totalPending = Math.max(0, totalRevenue - totalReceived);
    const totalServices = filteredClientAggregates.reduce(
      (sum, c) => sum + c.filteredServicesCount,
      0,
    );
    const totalVehicles = filteredClientAggregates.reduce((sum, c) => sum + c.totalVehicles, 0);

    return {
      totalRevenue,
      totalReceived,
      totalPending,
      totalServices,
      totalVehicles,
    };
  }, [filteredClientAggregates]);

  // Rankings
  const rankings = useMemo(() => {
    const topRevenue = [...filteredClientAggregates]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
    const topVolume = [...filteredClientAggregates]
      .sort((a, b) => b.filteredServicesCount - a.filteredServicesCount)
      .slice(0, 5);
    const topCollection = [...filteredClientAggregates]
      .sort((a, b) => b.received - a.received)
      .slice(0, 5);
    const topPending = [...filteredClientAggregates]
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 5);

    return {
      topRevenue,
      topVolume,
      topCollection,
      topPending,
    };
  }, [filteredClientAggregates]);

  // Monthly Revenue & Service counts charts aggregation
  const monthlyChartData = useMemo(() => {
    const monthlyMap: Record<string, { month: string; revenue: number; servicesCount: number }> =
      {};

    services.forEach((s) => {
      const sDate = s.createdAt ? new Date(s.createdAt) : new Date();
      if (sDate < dateRange.start || sDate > dateRange.end) return;

      const monthKey = s.createdAt
        ? s.createdAt.substring(0, 7)
        : new Date().toISOString().substring(0, 7); // YYYY-MM
      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = {
          month: monthKey,
          revenue: 0,
          servicesCount: 0,
        };
      }
      monthlyMap[monthKey].revenue += s.price ?? s.serviceAmount ?? 0;
      monthlyMap[monthKey].servicesCount++;
    });

    return Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));
  }, [services, dateRange]);

  // Pie chart service type distribution data
  const pieChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    SERVICE_CATEGORIES.forEach((cat) => {
      counts[cat] = 0;
    });

    services.forEach((s) => {
      const sDate = s.createdAt ? new Date(s.createdAt) : new Date();
      if (sDate < dateRange.start || sDate > dateRange.end) return;

      const label = serviceLabel(s.serviceType);
      if (counts[label] !== undefined) {
        counts[label]++;
      } else {
        counts["Other Services"]++;
      }
    });

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .filter((item) => item.value > 0);
  }, [services, dateRange]);

  // Top clients by revenue chart data
  const topClientsChartData = useMemo(() => {
    return [...filteredClientAggregates]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((c) => ({
        name: c.name.length > 15 ? c.name.substring(0, 15) + "..." : c.name,
        revenue: c.revenue,
      }));
  }, [filteredClientAggregates]);

  // Exports
  const handleExportCSV = () => {
    const csvData = filteredClientAggregates.map((c) => ({
      "Client Name": c.name,
      Company: c.companyName,
      Vehicles: c.totalVehicles,
      "Total Services": c.totalServices,
      "Services (Selected Period)": c.filteredServicesCount,
      "Revenue Generated (₹)": c.revenue,
      "Received (₹)": c.received,
      "Pending (₹)": c.pending,
      "Average Monthly Business (₹)": c.averageMonthlyBusiness,
      "Last Activity": c.lastServiceActivityDate,
    }));
    if (csvData.length === 0) return toast.error("No data to export");

    const headers = Object.keys(csvData[0]).join(",");
    const rows = csvData.map((row) =>
      Object.values(row)
        .map((val) => `"${String(val).replace(/"/g, '""')}"`)
        .join(","),
    );

    const blob = new Blob([[headers, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `client_analytics_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const handleExportExcel = () => {
    // Comma-separated value sheet format
    handleExportCSV();
  };

  const handleExportPDF = () => {
    generatePDF("client-analytics", {
      totalClients: clients.length,
      totalRevenue: summaryMetrics.totalRevenue,
      topClients: rankings.topRevenue.map((c) => ({
        name: c.name,
        vehiclesCount: c.totalVehicles,
        revenue: c.revenue,
      })),
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto print:p-0">
      {/* Header and Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BarChart3 className="size-6 text-primary animate-pulse" />
            Client Business Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time visual performance analysis, client rankings, and growth trends.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={handleExportCSV} variant="outline" size="sm" className="h-9 gap-1.5">
            <Download className="size-4" /> Export CSV
          </Button>
          <Button onClick={handleExportExcel} variant="outline" size="sm" className="h-9 gap-1.5">
            <Download className="size-4" /> Export Excel
          </Button>
          <Button onClick={handleExportPDF} size="sm" className="h-9 gap-1.5">
            <FileText className="size-4" /> Print PDF Report
          </Button>
        </div>
      </div>

      {/* Query Filters */}
      <div className="grid gap-4 md:grid-cols-4 items-end bg-card p-4 border rounded-xl shadow-sm print:hidden">
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="search" className="text-xs font-bold uppercase text-muted-foreground">
            Search Client / Vehicle / Assignee
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Search by client name, mobile, group, vehicle number..."
              className="pl-9 h-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="period" className="text-xs font-bold uppercase text-muted-foreground">
            Date Period
          </Label>
          <Select value={period} onValueChange={(val: any) => setPeriod(val)}>
            <SelectTrigger id="period" className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
              <SelectItem value="custom">Custom Date Range</SelectItem>
              <SelectItem value="all-time">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {period === "custom" && (
          <div className="grid grid-cols-2 gap-2 md:col-span-4 mt-2">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                Start Date
              </Label>
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                End Date
              </Label>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {/* Aggregate metrics summary widgets */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase font-bold tracking-wide text-muted-foreground">
              Total Services
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tracking-tight text-foreground">
              {summaryMetrics.totalServices}
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase font-bold tracking-wide text-muted-foreground">
              Total Vehicles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tracking-tight text-foreground">
              {summaryMetrics.totalVehicles}
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase font-bold tracking-wide text-primary">
              Revenue Generated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tracking-tight text-primary">
              ₹{summaryMetrics.totalRevenue.toLocaleString("en-IN")}
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase font-bold tracking-wide text-emerald-600">
              Total Received
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tracking-tight text-emerald-600">
              ₹{summaryMetrics.totalReceived.toLocaleString("en-IN")}
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase font-bold tracking-wide text-destructive">
              Pending Collection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tracking-tight text-destructive">
              ₹{summaryMetrics.totalPending.toLocaleString("en-IN")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rankings Leaderboards */}
      <div className="grid gap-6 md:grid-cols-4">
        {/* Top Revenue */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 border-b mb-3">
            <CardTitle className="text-xs uppercase font-bold text-muted-foreground">
              Top Revenue Clients
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rankings.topRevenue.map((c, i) => (
              <div key={c.id} className="flex justify-between items-center text-xs">
                <span className="font-medium text-foreground truncate max-w-[120px]">
                  {i + 1}. {c.name}
                </span>
                <span className="font-mono font-bold text-primary">
                  ₹{c.revenue.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Volume */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 border-b mb-3">
            <CardTitle className="text-xs uppercase font-bold text-muted-foreground">
              Top Volume Clients
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rankings.topVolume.map((c, i) => (
              <div key={c.id} className="flex justify-between items-center text-xs">
                <span className="font-medium text-foreground truncate max-w-[120px]">
                  {i + 1}. {c.name}
                </span>
                <span className="font-bold text-sky-500">{c.filteredServicesCount} services</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Collections */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 border-b mb-3">
            <CardTitle className="text-xs uppercase font-bold text-muted-foreground">
              Top Collection Clients
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rankings.topCollection.map((c, i) => (
              <div key={c.id} className="flex justify-between items-center text-xs">
                <span className="font-medium text-foreground truncate max-w-[120px]">
                  {i + 1}. {c.name}
                </span>
                <span className="font-mono font-bold text-emerald-600">
                  ₹{c.received.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Pending */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 border-b mb-3">
            <CardTitle className="text-xs uppercase font-bold text-muted-foreground">
              Top Pending Clients
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rankings.topPending.map((c, i) => (
              <div key={c.id} className="flex justify-between items-center text-xs">
                <span className="font-medium text-foreground truncate max-w-[120px]">
                  {i + 1}. {c.name}
                </span>
                <span className="font-mono font-bold text-destructive">
                  ₹{c.pending.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2 print:grid-cols-1">
        {/* Revenue Trend */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Revenue Trend (Selected Period)</CardTitle>
            <CardDescription className="text-xs">
              Monthly comparison of business revenue
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {monthlyChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                No data inside selected range.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 10 }}
                  />
                  <YAxis tickLine={false} axisLine={false} style={{ fontSize: 10 }} />
                  <ChartTooltip
                    formatter={(val: number) => [`₹${val.toLocaleString()}`, "Revenue"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Service Volume Trend */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Service Volume Trend</CardTitle>
            <CardDescription className="text-xs">
              Monthly total service request volume
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {monthlyChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                No data inside selected range.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 10 }}
                  />
                  <YAxis tickLine={false} axisLine={false} style={{ fontSize: 10 }} />
                  <ChartTooltip formatter={(val: number) => [val, "Services Sold"]} />
                  <Bar dataKey="servicesCount" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Service Type Distribution */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Service Type Distribution</CardTitle>
            <CardDescription className="text-xs">
              Breakdown of services taken by clients
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[280px] flex items-center justify-center">
            {pieChartData.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                No services logged in this period.
              </div>
            ) : (
              <div className="w-full h-full flex flex-col md:flex-row items-center justify-around">
                <div className="w-[180px] h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {pieChartData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-1.5">
                      <div
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="truncate max-w-[100px] text-muted-foreground">
                        {entry.name} ({entry.value})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top 10 Clients by Revenue */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top 10 Clients by Revenue</CardTitle>
            <CardDescription className="text-xs">
              Highest business volume contributors
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {topClientsChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                No data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topClientsChartData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" tickLine={false} axisLine={false} style={{ fontSize: 9 }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 9 }}
                  />
                  <ChartTooltip
                    formatter={(val: number) => [`₹${val.toLocaleString()}`, "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main clients list */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-foreground">Detailed Client Analytics</h2>
        {filteredClientAggregates.length === 0 ? (
          <div className="text-center py-20 border border-dashed rounded-xl bg-muted/10">
            <AlertCircle className="size-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No client data found matching your query or date filters.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredClientAggregates.map((item) => {
              const expanded = expandedClientId === item.id;
              return (
                <div
                  key={item.id}
                  className="border bg-card rounded-xl shadow-sm overflow-hidden transition-all hover:border-muted-foreground/20"
                >
                  {/* Collapsible header */}
                  <div
                    onClick={() => setExpandedClientId(expanded ? null : item.id)}
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none bg-muted/5 hover:bg-muted/15"
                  >
                    <div className="flex items-center gap-3">
                      {expanded ? (
                        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <div>
                        <span className="font-bold text-foreground block md:text-sm">
                          {item.name}
                        </span>
                        <span className="text-xs text-muted-foreground mt-0.5">
                          {item.companyName || "No Company"} • {item.totalVehicles} Vehicles
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono md:text-right shrink-0">
                      <div>
                        <span className="text-[9px] uppercase font-bold text-muted-foreground block">
                          Services
                        </span>
                        <span className="font-bold text-foreground">
                          {item.filteredServicesCount} / {item.totalServices}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold text-muted-foreground block">
                          Revenue
                        </span>
                        <span className="font-bold text-primary">
                          ₹{item.revenue.toLocaleString("en-IN")}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold text-muted-foreground block">
                          Pending
                        </span>
                        <span className="font-bold text-destructive">
                          ₹{item.pending.toLocaleString("en-IN")}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold text-muted-foreground block">
                          Growth
                        </span>
                        <span
                          className={`font-bold ${item.growthRate >= 0 ? "text-green-600" : "text-red-500"}`}
                        >
                          {item.growthRate >= 0 ? `+${item.growthRate}%` : `${item.growthRate}%`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded analytics view */}
                  {expanded && (
                    <div className="p-5 border-t space-y-6 bg-background">
                      {/* Sub-Metrics Panel */}
                      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 text-xs">
                        <div className="p-3 border rounded-lg bg-muted/15">
                          <span className="text-muted-foreground uppercase font-bold text-[9px] block">
                            Services This Month
                          </span>
                          <span className="text-lg font-bold text-foreground">
                            {item.servicesThisMonth}
                          </span>
                        </div>
                        <div className="p-3 border rounded-lg bg-muted/15">
                          <span className="text-muted-foreground uppercase font-bold text-[9px] block">
                            Services Last Month
                          </span>
                          <span className="text-lg font-bold text-foreground">
                            {item.servicesLastMonth}
                          </span>
                        </div>
                        <div className="p-3 border rounded-lg bg-muted/15">
                          <span className="text-muted-foreground uppercase font-bold text-[9px] block">
                            Average Monthly Business
                          </span>
                          <span className="text-lg font-bold text-foreground">
                            ₹{item.averageMonthlyBusiness.toLocaleString("en-IN")}
                          </span>
                        </div>
                        <div className="p-3 border rounded-lg bg-muted/15">
                          <span className="text-muted-foreground uppercase font-bold text-[9px] block">
                            Last Activity Date
                          </span>
                          <span className="text-lg font-bold text-foreground">
                            {item.lastServiceActivityDate}
                          </span>
                        </div>
                      </div>

                      {/* Service Breakdown matrix */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Service Wise Breakdown
                        </h4>
                        <div className="grid gap-2 grid-cols-2 sm:grid-cols-5 text-xs">
                          {Object.entries(item.serviceBreakdown).map(([name, count]) => (
                            <div
                              key={name}
                              className="p-2 border rounded-lg flex items-center justify-between bg-muted/5"
                            >
                              <span className="text-muted-foreground font-medium">{name}</span>
                              <Badge variant="outline" className="font-semibold font-mono">
                                {count}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Vehicle Contributions Table */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Vehicle Contributions ({item.vehicleStats.length})
                        </h4>
                        {item.vehicleStats.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">
                            No vehicle details registered.
                          </p>
                        ) : (
                          <div className="border rounded-lg overflow-x-auto bg-card">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="border-b bg-muted/20 text-muted-foreground uppercase text-[9px] font-bold">
                                  <th className="p-3">Vehicle Number</th>
                                  <th className="p-3">Type</th>
                                  <th className="p-3">Active Services</th>
                                  <th className="p-3 text-right">Revenue</th>
                                  <th className="p-3 text-right">Pending</th>
                                  <th className="p-3">Last Service</th>
                                  <th className="p-3">Next Due</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y font-medium text-foreground">
                                {item.vehicleStats.map((vStat, idx) => (
                                  <tr
                                    key={`${vStat.vehicleNumber}-${idx}`}
                                    className="hover:bg-muted/5"
                                  >
                                    <td className="p-3 font-mono font-bold text-primary">
                                      {vStat.vehicleNumber}
                                    </td>
                                    <td className="p-3">{vStat.vehicleType || "—"}</td>
                                    <td className="p-3">
                                      <div className="flex gap-1 flex-wrap">
                                        {vStat.activeServices.length === 0 ? (
                                          <span className="text-muted-foreground italic text-[10px]">
                                            No active services
                                          </span>
                                        ) : (
                                          vStat.activeServices.map((as, i) => (
                                            <Badge
                                              key={i}
                                              variant="outline"
                                              className="text-[9px] px-1 py-0"
                                            >
                                              {as}
                                            </Badge>
                                          ))
                                        )}
                                      </div>
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold">
                                      ₹{vStat.revenue.toLocaleString("en-IN")}
                                    </td>
                                    <td className="p-3 text-right font-mono text-destructive">
                                      ₹{vStat.pending.toLocaleString("en-IN")}
                                    </td>
                                    <td className="p-3 font-mono text-muted-foreground">
                                      {vStat.lastServiceDate}
                                    </td>
                                    <td className="p-3 font-mono text-emerald-600 font-semibold">
                                      {vStat.nextDueDate}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
