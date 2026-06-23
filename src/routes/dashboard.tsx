import { createFileRoute, redirect, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, UserPlus, CheckSquare,
  UserCircle, BarChart3, DollarSign, LineChart,
  Settings as SettingsIcon, LogOut, Menu, Globe, Target, Users2,
  Shield, CheckCircle, Lightbulb, FileText, Zap, Receipt,
} from "lucide-react";
import { getSession, logout, isAuthReady, type StaffUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    // Prefer the lightweight cached session so refresh restores the page fast.
    if (getSession()) return;

    if (!isAuthReady()) {
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (isAuthReady() || getSession()) {
            clearInterval(interval);
            resolve();
          }
        }, 50);
        setTimeout(() => {
          clearInterval(interval);
          resolve();
        }, 1500);
      });
    }

    if (!getSession()) {
      throw redirect({ to: "/" });
    }
  },
  component: DashboardLayout,
});

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
type NavGroup = { heading: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    heading: "Operational",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { to: "/dashboard/clients", label: "Clients", icon: Users },
      { to: "/dashboard/leads", label: "Leads", icon: UserPlus },
      { to: "/dashboard/tasks", label: "Tasks", icon: CheckSquare },
    ],
  },
  {
    heading: "Database",
    items: [
      { to: "/dashboard/all-clients", label: "All Clients", icon: Users2 },
      { to: "/dashboard/customers", label: "Customers", icon: UserCircle },
      { to: "/dashboard/documents", label: "Documents", icon: FileText },
      { to: "/dashboard/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    heading: "Services",
    items: [
      { to: "/dashboard/service/insurance", label: "Insurance", icon: Shield },
      { to: "/dashboard/service/fitness", label: "Fitness", icon: CheckCircle },
      { to: "/dashboard/service/gujarat-permit", label: "Gujarat Permit", icon: FileText },
      { to: "/dashboard/service/national-permit", label: "National Permit", icon: FileText },
      { to: "/dashboard/service/tax", label: "Tax", icon: DollarSign },
      { to: "/dashboard/service/puc", label: "PUC", icon: Lightbulb },
      { to: "/dashboard/service/license-new", label: "License New", icon: FileText },
      { to: "/dashboard/service/license-renew", label: "License Renew", icon: FileText },
      { to: "/dashboard/service/rc-transfer", label: "RC Transfer", icon: Zap },
      { to: "/dashboard/service/hp-addition", label: "HP Addition", icon: Zap },
      { to: "/dashboard/service/hp-termination", label: "HP Termination", icon: Zap },
    ],
  },
  {
    heading: "Financial",
    items: [
      { to: "/dashboard/accounting", label: "Accounting", icon: DollarSign },
      { to: "/dashboard/billing", label: "Billing", icon: Receipt },
      { to: "/dashboard/analytics", label: "Analytics", icon: LineChart },
      { to: "/dashboard/targets", label: "Target Management", icon: Target },
    ],
  },
  {
    heading: "System",
    items: [
      { to: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

function DashboardLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [user, setUser] = useState<StaffUser | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setUser(getSession());
    const handler = () => setUser(getSession());
    window.addEventListener("auth-change", handler);
    return () => window.removeEventListener("auth-change", handler);
  }, []);

  const handleLogout = async () => { await logout(); navigate({ to: "/" }); };

  const initials = (user?.name ?? "U").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen flex bg-background">
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-transform",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="p-5 flex items-center gap-3 border-b border-sidebar-border">
          <div className="size-9 rounded-lg bg-primary grid place-items-center font-bold text-primary-foreground">R</div>
          <div className="font-bold tracking-tight">REGISTRY PRO</div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-5">
          {GROUPS.map((group) => (
            <div key={group.heading}>
              <div className="px-3 mb-1 text-[11px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
                {group.heading}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                        active
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-border/40 hover:text-sidebar-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3 space-y-2">
          <a
            href="/"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-border/40 hover:text-sidebar-foreground"
          >
            <Globe className="size-4" /> View public site
          </a>
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="size-9 rounded-full bg-muted grid place-items-center text-xs font-bold">{initials}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.name ?? "—"}</div>
              <div className="text-xs text-sidebar-foreground/60 capitalize">{user?.role}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Sign out">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      {open && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b bg-card flex items-center gap-3 px-4 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <h1 className="font-semibold">
            {ALL_ITEMS.find((n) => (n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + "/")))?.label ?? "Dashboard"}
          </h1>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
