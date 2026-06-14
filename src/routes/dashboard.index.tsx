import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { subscribeToRecords, SERVICE_TYPES, serviceLabel, serviceToUrlParam, type RegistryRecord } from "@/lib/records";
import { getTotalRevenue, getActiveServicesCount, getRevenueByService, getUpcomingRenewals } from "@/lib/services";
import { ArrowRight, Users, UserPlus, CheckCircle2, Clock, TrendingUp, DollarSign, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/dashboard/")({
  component: Overview,
});

function Overview() {
  const [clients, setClients] = useState<RegistryRecord[]>([]);
  const [leads, setLeads] = useState<RegistryRecord[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [activeServices, setActiveServices] = useState(0);
  const [revenueByService, setRevenueByService] = useState<{ service: string; revenue: number }[]>([]);
  const [upcomingRenewals, setUpcomingRenewals] = useState<RegistryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u1 = subscribeToRecords("clients", setClients);
    const u2 = subscribeToRecords("leads", setLeads);
    return () => { u1(); u2(); };
  }, []);

  useEffect(() => {
    const loadServiceData = async () => {
      try {
        const [revenue, active, byService, renewals] = await Promise.all([
          getTotalRevenue(),
          getActiveServicesCount(),
          getRevenueByService(),
          getUpcomingRenewals(30),
        ]);

        setTotalRevenue(revenue);
        setActiveServices(active);
        setRevenueByService(byService);
        setUpcomingRenewals(renewals);
      } catch (error) {
        console.error("Error loading service data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadServiceData();
  }, []);

  const completed = clients.filter((c) => c.status === "Completed").length;
  const inProgress = [...clients, ...leads].filter((c) => c.status === "In Progress").length;

  const stats = [
    { label: "Clients", value: clients.length, icon: Users, href: "/dashboard/clients" },
    { label: "Active leads", value: leads.length, icon: UserPlus, href: "/dashboard/leads" },
    { label: "In progress", value: inProgress, icon: Clock, href: "/dashboard/clients" },
    { label: "Completed", value: completed, icon: CheckCircle2, href: "/dashboard/clients" },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
        <p className="text-sm text-muted-foreground">Snapshot of today's office activity.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            to={s.href}
            className="group rounded-xl border bg-card p-5 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <s.icon className="size-4 text-primary" />
            </div>
            <div className="mt-3 text-3xl font-bold">{s.value}</div>
            <div className="mt-2 text-xs text-muted-foreground inline-flex items-center gap-1 group-hover:text-primary">
              View <ArrowRight className="size-3" />
            </div>
          </Link>
        ))}
      </div>

      {/* Service Management Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Service Management</h3>

        {/* Revenue and Services Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{totalRevenue.toLocaleString("en-IN")}</div>
              <p className="text-xs text-muted-foreground mt-1">All services combined</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Services</CardTitle>
              <TrendingUp className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{activeServices}</div>
              <p className="text-xs text-muted-foreground mt-1">In progress</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Upcoming Renewals</CardTitle>
              <AlertCircle className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{upcomingRenewals.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Due in 30 days</p>
            </CardContent>
          </Card>
        </div>

        {/* Revenue by Service */}
        {revenueByService.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Revenue by Service</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {revenueByService.map((item) => (
                  <Link
                    key={item.service}
                    to={`/dashboard/service/${serviceToUrlParam(item.service as any)}`}
                    className="flex items-center justify-between p-2 rounded hover:bg-muted transition-colors"
                  >
                    <span className="text-sm font-medium">{serviceLabel(item.service as any)}</span>
                    <span className="font-bold">₹{item.revenue.toLocaleString("en-IN")}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Service Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Quick Access Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {SERVICE_TYPES.map((service) => (
                <Link
                  key={service}
                  to={`/dashboard/service/${serviceToUrlParam(service)}`}
                  className="p-2 rounded border hover:border-primary hover:bg-muted transition-colors text-center text-xs font-medium"
                >
                  {serviceLabel(service)}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Renewals Table */}
        {upcomingRenewals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Upcoming Renewals (30 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {upcomingRenewals.map((renewal) => (
                  <div key={renewal.id} className="flex items-center justify-between p-2 border rounded text-sm">
                    <div>
                      <p className="font-medium">{renewal.name}</p>
                      <p className="text-xs text-muted-foreground">{serviceLabel(renewal.serviceType)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium">
                        {renewal.serviceDueDate 
                          ? new Date(renewal.serviceDueDate).toLocaleDateString("en-IN")
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold">Quick actions</h3>
        <p className="text-sm text-muted-foreground mt-1">Jump straight into the most common tasks.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/dashboard/clients" className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90">Open Clients</Link>
          <Link to="/dashboard/leads" className="px-3 py-2 text-sm rounded-md border hover:bg-muted">Open Leads</Link>
        </div>
      </div>
    </div>
  );
}
