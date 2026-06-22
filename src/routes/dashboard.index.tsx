import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { subscribeToRecords, SERVICE_TYPES, serviceLabel, serviceToUrlParam, type RegistryRecord } from "@/lib/records";
import { computeFollowUps } from "@/lib/followups";
import { getTotalRevenue, getActiveServicesCount, getRevenueByService, getUpcomingRenewals } from "@/lib/services";
import { subscribeToAllPayments, type ClientPayment } from "@/lib/payments";
import { subscribeToTasks, type Task } from "@/lib/tasks";
import { subscribeToTargets, calculateTargetMetrics, type TargetMetrics } from "@/lib/targets";
import { calculateBillingMetrics } from "@/lib/billing";
import { ArrowRight, Users, UserPlus, CheckCircle2, Clock, TrendingUp, DollarSign, AlertCircle, Zap, Target, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/dashboard/")({
  component: Overview,
});

function Overview() {
  const [clients, setClients] = useState<RegistryRecord[]>([]);
  const [leads, setLeads] = useState<RegistryRecord[]>([]);
  const [customers, setCustomers] = useState<RegistryRecord[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [activeServices, setActiveServices] = useState(0);
  const [revenueByService, setRevenueByService] = useState<{ service: string; revenue: number }[]>([]);
  const [upcomingRenewals, setUpcomingRenewals] = useState<RegistryRecord[]>([]);
  const [allPayments, setAllPayments] = useState<ClientPayment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [targets, setTargets] = useState<TargetMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ type: string } | null>(null);
  const [billingMetrics, setBillingMetrics] = useState({
    totalInvoiced: 0,
    totalCollected: 0,
    outstandingAmount: 0,
    invoicesThisMonth: 0,
    pendingInvoices: 0,
    overdueInvoices: 0,
    collectionRate: 0,
  });

  useEffect(() => {
    const u1 = subscribeToRecords("clients", setClients);
    const u2 = subscribeToRecords("leads", setLeads);
    const u3 = subscribeToRecords("customers", setCustomers);
    const u4 = subscribeToTasks((allTasks) => setTasks(allTasks));
    const u5 = subscribeToTargets((allTargets) => {
      const enriched = allTargets.map(t => calculateTargetMetrics(t));
      setTargets(enriched);
    });
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, []);

  useEffect(() => {
    const unsub = subscribeToAllPayments((items) => {
      setAllPayments(items);
      const sum = items.reduce((s, p) => s + (p.amount || 0), 0);
      setTotalRevenue(sum);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const loadServiceData = async () => {
      try {
        const [revenue, active, byService, renewals, billing] = await Promise.all([
          getTotalRevenue(),
          getActiveServicesCount(),
          getRevenueByService(),
          getUpcomingRenewals(30),
          calculateBillingMetrics(),
        ]);

        setTotalRevenue(revenue);
        setActiveServices(active);
        setRevenueByService(byService);
        setUpcomingRenewals(renewals);
        setBillingMetrics(billing);
      } catch (error) {
        console.error("Error loading service data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadServiceData();
  }, []);

    // Compute follow-ups in real-time from all registry buckets
    const [followups, setFollowups] = useState<any>(null);
    useEffect(() => {
      const all = [...clients, ...leads, ...customers];
      setFollowups(computeFollowUps(all));
    }, [clients, leads, customers]);

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
        {followups && (
          <div className="space-y-4 mt-4">
            <h3 className="text-lg font-semibold">Follow-Up Center</h3>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Card
                className="group cursor-pointer hover:bg-orange-50 hover:border-orange-300 hover:shadow-lg transition-colors"
                onClick={() => setFilter({ type: 'today' })}
              >
                <CardHeader>
                  <CardTitle className="text-sm group-hover:text-orange-600">Today's Follow-Ups</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold group-hover:text-orange-600">{followups.totals.today}</div>
                </CardContent>
              </Card>

              <Card
                className="group cursor-pointer hover:bg-orange-50 hover:border-orange-300 hover:shadow-lg transition-colors"
                onClick={() => setFilter({ type: 'upcoming7' })}
              >
                <CardHeader>
                  <CardTitle className="text-sm group-hover:text-orange-600">Upcoming 7 Days</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold group-hover:text-orange-600">{followups.totals.upcoming7}</div>
                </CardContent>
              </Card>

              <Card
                className="group cursor-pointer hover:bg-orange-50 hover:border-orange-300 hover:shadow-lg transition-colors"
                onClick={() => setFilter({ type: 'upcoming15' })}
              >
                <CardHeader>
                  <CardTitle className="text-sm group-hover:text-orange-600">Upcoming 15 Days</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold group-hover:text-orange-600">{followups.totals.upcoming15}</div>
                </CardContent>
              </Card>

              <Card
                className="group cursor-pointer hover:bg-orange-50 hover:border-orange-300 hover:shadow-lg transition-colors"
                onClick={() => setFilter({ type: 'upcoming30' })}
              >
                <CardHeader>
                  <CardTitle className="text-sm group-hover:text-orange-600">Upcoming 30 Days</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold group-hover:text-orange-600">{followups.totals.upcoming30}</div>
                </CardContent>
              </Card>

              <Card
                className="group cursor-pointer hover:bg-orange-50 hover:border-orange-300 hover:shadow-lg transition-colors"
                onClick={() => setFilter({ type: 'overdue' })}
              >
                <CardHeader>
                  <CardTitle className="text-sm group-hover:text-orange-600">Overdue Services</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600 group-hover:text-orange-600">{followups.totals.overdue}</div>
                </CardContent>
              </Card>

              <Card className="group cursor-pointer hover:bg-orange-50 hover:border-orange-300 hover:shadow-lg transition-colors">
                <CardHeader>
                  <CardTitle className="text-sm group-hover:text-orange-600">Total Active Services</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold group-hover:text-orange-600">{followups.totals.totalActiveServices}</div>
                </CardContent>
              </Card>
            </div>

            {/* Quick lists - show filtered entries when a card is clicked */}
            <FollowUpLists followups={followups} filter={filter} setFilter={setFilter} />
          </div>
        )}

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

      {/* Pending Follow-ups Section */}
      {tasks.filter(t => !t.done && t.status !== "Completed").length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Zap className="size-5 text-orange-500" />
            Pending Follow-ups
          </h3>
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {tasks
                  .filter(t => !t.done && t.status !== "Completed")
                  .sort((a, b) => {
                    const priorityOrder = { "Urgent": 0, "High": 1, "Medium": 2, "Low": 3 };
                    return priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
                  })
                  .slice(0, 5)
                  .map((task) => (
                    <Link
                      key={task.id}
                      to={`/dashboard/tasks`}
                      className="flex items-start justify-between p-3 border rounded hover:bg-muted transition-colors group"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{task.title}</p>
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            task.priority === "Urgent" ? "bg-red-100 text-red-700" :
                            task.priority === "High" ? "bg-orange-100 text-orange-700" :
                            task.priority === "Medium" ? "bg-yellow-100 text-yellow-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>
                            {task.priority}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {task.assignee} • {task.status}
                        </p>
                      </div>
                      <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary" />
                    </Link>
                  ))}
              </div>
              {tasks.filter(t => !t.done && t.status !== "Completed").length > 5 && (
                <Link to="/dashboard/tasks" className="text-xs text-primary hover:underline mt-3 inline-block">
                  View all {tasks.filter(t => !t.done && t.status !== "Completed").length} follow-ups →
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Targets Progress Section */}
      {targets.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Target className="size-5 text-blue-500" />
            Performance Targets
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {targets.map((target) => (
              <Card key={target.id}>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div>
                      <p className="font-semibold text-sm">{target.category}</p>
                      <p className="text-2xl font-bold text-blue-600">{target.completed}/{target.target}</p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(target.achievementPercentage, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{target.achievementPercentage.toFixed(0)}%</span>
                      <span className="text-muted-foreground">{target.remaining} remaining</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

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

function FollowUpLists({ followups, filter, setFilter }: any) {
  const type = filter?.type || "today";
  const list =
    type === "today" ? followups.today :
    type === "upcoming7" ? followups.upcoming7 :
    type === "upcoming15" ? followups.upcoming15 :
    type === "upcoming30" ? followups.upcoming30 :
    type === "overdue" ? followups.overdue : followups.flat;

  return (
    <div>
      <div className="mt-3 grid gap-3">
        {list.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">No records found for this filter.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{type === 'today' ? "Today's Follow-Ups" : type}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {list.map((e: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 border rounded text-sm">
                    <div>
                      <p className="font-medium">{e.clientName}</p>
                      <p className="text-xs text-muted-foreground">{e.serviceType} • {e.mvNo || '—'}</p>
                    </div>
                    <div className="text-right text-xs">
                      <div>{e.dueDate ? new Date(e.dueDate).toLocaleDateString('en-IN') : 'N/A'}</div>
                      <div className="text-muted-foreground">{e.daysRemaining !== undefined ? `${e.daysRemaining} days` : ''}</div>
                      <div className="text-xs">{e.assignee || 'Unassigned'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
