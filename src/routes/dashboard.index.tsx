import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadRecords, type RegistryRecord } from "@/lib/records";
import { ArrowRight, Users, UserPlus, CheckCircle2, Clock } from "lucide-react";

export const Route = createFileRoute("/dashboard/")({
  component: Overview,
});

function Overview() {
  const [clients, setClients] = useState<RegistryRecord[]>([]);
  const [leads, setLeads] = useState<RegistryRecord[]>([]);

  useEffect(() => {
    setClients(loadRecords("clients"));
    setLeads(loadRecords("leads"));
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
