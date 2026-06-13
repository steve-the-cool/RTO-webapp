import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Download, Printer } from "lucide-react";
import { subscribeToRecords, type RegistryRecord, type Bucket } from "@/lib/records";
import { generateAccountingPDF, printWindow } from "@/lib/pdfGenerator";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/accounting")({
  component: AccountingDashboard,
});

function AccountingDashboard() {
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

  // Calculate accounting metrics
  const metrics = useMemo(() => {
    const records = allRecords.filter((r) => r.serviceAmount && r.serviceAmount > 0);

    const totalServiceAmount = records.reduce((sum, r) => sum + (r.serviceAmount || 0), 0);
    const totalAmountReceived = records.reduce((sum, r) => sum + (r.amountReceived || 0), 0);
    const totalPendingAmount = totalServiceAmount - totalAmountReceived;

    const unpaidCount = records.filter((r) => r.paymentStatus === "Unpaid").length;
    const partiallyPaidCount = records.filter((r) => r.paymentStatus === "Partially Paid").length;
    const paidCount = records.filter((r) => r.paymentStatus === "Paid").length;

    const pendingRecords = records
      .filter((r) => r.paymentStatus === "Unpaid" || r.paymentStatus === "Partially Paid")
      .sort((a, b) => {
        const aPending = (a.serviceAmount || 0) - (a.amountReceived || 0);
        const bPending = (b.serviceAmount || 0) - (b.amountReceived || 0);
        return bPending - aPending;
      });

    return {
      totalServiceAmount,
      totalAmountReceived,
      totalPendingAmount,
      unpaidCount,
      partiallyPaidCount,
      paidCount,
      totalRecords: records.length,
      pendingRecords,
      collectionRate: totalServiceAmount > 0 ? (totalAmountReceived / totalServiceAmount) * 100 : 0,
    };
  }, [allRecords]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Accounting & Revenue</h2>
          <p className="text-sm text-muted-foreground">Financial overview and payment tracking</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateAccountingPDF(allRecords, {
              totalServiceAmount: metrics.totalServiceAmount,
              totalAmountReceived: metrics.totalAmountReceived,
              totalPendingAmount: metrics.totalPendingAmount,
              collectionRate: metrics.collectionRate,
            })}
          >
            <Download className="size-4 mr-1" />Export PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={printWindow}
          >
            <Printer className="size-4 mr-1" />Print
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Revenue"
          value={`₹${metrics.totalServiceAmount.toLocaleString("en-IN")}`}
          icon={TrendingUp}
          color="bg-blue-500/10 text-blue-600"
          subtext={`${metrics.totalRecords} active records`}
        />
        <MetricCard
          label="Amount Collected"
          value={`₹${metrics.totalAmountReceived.toLocaleString("en-IN")}`}
          icon={CheckCircle2}
          color="bg-green-500/10 text-green-600"
          subtext={`${metrics.collectionRate.toFixed(1)}% collection rate`}
        />
        <MetricCard
          label="Pending Revenue"
          value={`₹${metrics.totalPendingAmount.toLocaleString("en-IN")}`}
          icon={TrendingDown}
          color="bg-amber-500/10 text-amber-600"
          subtext={`${metrics.unpaidCount + metrics.partiallyPaidCount} pending`}
        />
        <MetricCard
          label="At Risk"
          value={metrics.unpaidCount.toString()}
          icon={AlertCircle}
          color="bg-red-500/10 text-red-600"
          subtext={`${metrics.partiallyPaidCount} partially paid`}
        />
      </div>

      {/* Payment Status Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Paid</p>
            <p className="text-3xl font-bold text-green-600">{metrics.paidCount}</p>
            <p className="text-xs text-muted-foreground">
              {metrics.totalRecords > 0 && `${((metrics.paidCount / metrics.totalRecords) * 100).toFixed(1)}% of records`}
            </p>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Partially Paid</p>
            <p className="text-3xl font-bold text-amber-600">{metrics.partiallyPaidCount}</p>
            <p className="text-xs text-muted-foreground">
              {metrics.totalRecords > 0 && `${((metrics.partiallyPaidCount / metrics.totalRecords) * 100).toFixed(1)}% of records`}
            </p>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Unpaid</p>
            <p className="text-3xl font-bold text-red-600">{metrics.unpaidCount}</p>
            <p className="text-xs text-muted-foreground">
              {metrics.totalRecords > 0 && `${((metrics.unpaidCount / metrics.totalRecords) * 100).toFixed(1)}% of records`}
            </p>
          </div>
        </div>
      </div>

      {/* Pending Records Table */}
      {metrics.pendingRecords.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="border-b bg-muted/60 px-6 py-3">
            <h3 className="font-semibold">Pending Payments ({metrics.pendingRecords.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-semibold px-6 py-3 whitespace-nowrap">Client</th>
                  <th className="text-right font-semibold px-6 py-3 whitespace-nowrap">Service Amount</th>
                  <th className="text-right font-semibold px-6 py-3 whitespace-nowrap">Received</th>
                  <th className="text-right font-semibold px-6 py-3 whitespace-nowrap">Pending</th>
                  <th className="text-left font-semibold px-6 py-3 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {metrics.pendingRecords.map((record) => {
                  const pending = (record.serviceAmount || 0) - (record.amountReceived || 0);
                  return (
                    <tr key={record.id} className="border-t hover:bg-muted/30">
                      <td className="px-6 py-3">
                        <div>
                          <p className="font-medium">{record.name}</p>
                          <p className="text-xs text-muted-foreground">{record.mvNo}</p>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right font-mono">₹{(record.serviceAmount || 0).toLocaleString("en-IN")}</td>
                      <td className="px-6 py-3 text-right font-mono">₹{(record.amountReceived || 0).toLocaleString("en-IN")}</td>
                      <td className="px-6 py-3 text-right font-mono font-semibold text-amber-600">₹{pending.toLocaleString("en-IN")}</td>
                      <td className="px-6 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                            record.paymentStatus === "Paid"
                              ? "bg-green-500/15 text-green-700 border-green-500/30"
                              : record.paymentStatus === "Partially Paid"
                                ? "bg-yellow-500/15 text-yellow-700 border-yellow-500/30"
                                : "bg-red-500/15 text-red-700 border-red-500/30",
                          )}
                        >
                          {record.paymentStatus || "Unpaid"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {metrics.pendingRecords.length === 0 && metrics.totalRecords > 0 && (
        <div className="rounded-lg border bg-card p-12 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-600/50 mb-4" />
          <p className="text-lg font-semibold">All payments collected!</p>
          <p className="text-sm text-muted-foreground">No pending payments at this time.</p>
        </div>
      )}

      {metrics.totalRecords === 0 && (
        <div className="rounded-lg border bg-card p-12 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-lg font-semibold">No records with accounting data</p>
          <p className="text-sm text-muted-foreground">Add service amounts to records to see accounting metrics.</p>
        </div>
      )}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  subtext: string;
}

function MetricCard({ label, value, icon: Icon, color, subtext }: MetricCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{subtext}</p>
        </div>
        <div className={cn("rounded-lg p-2", color)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
