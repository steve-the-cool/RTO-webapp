import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { subscribeToRecords, type RegistryRecord, type Bucket } from "@/lib/records";

export const Route = createFileRoute("/dashboard/reports")({ component: ReportsPage });

const BUCKETS: Bucket[] = ["clients", "leads"];

function ReportsPage() {
  const [data, setData] = useState<Record<Bucket, RegistryRecord[]>>({
    clients: [],
    leads: [],
    customers: [],
  });

  useEffect(() => {
    const u1 = subscribeToRecords("clients", (r) => setData((d) => ({ ...d, clients: r })));
    const u2 = subscribeToRecords("leads", (r) => setData((d) => ({ ...d, leads: r })));
    return () => {
      u1();
      u2();
    };
  }, []);

  const all = BUCKETS.flatMap((b) => data[b]);
  const byStatus = all.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const total = all.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Reports</h2>
        <p className="text-sm text-muted-foreground">Aggregated activity across all registers.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BUCKETS.map((b) => (
          <div key={b} className="rounded-xl border bg-card p-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{b}</div>
            <div className="text-3xl font-bold mt-2">{data[b].length}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-4">Status breakdown ({total} total)</h3>
        <div className="space-y-2">
          {Object.entries(byStatus).map(([status, count]) => {
            const pct = total ? Math.round((count / total) * 100) : 0;
            return (
              <div key={status}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{status}</span>
                  <span className="text-muted-foreground">
                    {count} ({pct}%)
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          {total === 0 && <div className="text-sm text-muted-foreground">No data yet.</div>}
        </div>
      </div>
    </div>
  );
}
