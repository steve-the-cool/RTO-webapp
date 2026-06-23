import { useMemo } from "react";
import { type RegistryRecord, getRecordServiceAmount } from "@/lib/records";

export interface ServiceMetrics {
  totalServicesSold: number;
  totalRevenue: number;
  mostSoldService: { service: string; count: number } | null;
  leastSoldService: { service: string; count: number } | null;
  averageServiceValue: number;
  collectionRate: number;
}

export interface RevenueByService {
  service: string;
  revenue: number;
  servicesSold: number;
  averageValue: number;
}

export interface MonthlyData {
  month: string;
  revenue: number;
  servicesSold: number;
  collected: number;
}

export interface YearlyData {
  year: string;
  revenue: number;
  servicesSold: number;
  collected: number;
}

export interface ServiceDistribution {
  service: string;
  value: number;
  percentage: number;
}

/**
 * Main hook for service analytics calculations
 * Processes all records and returns comprehensive metrics
 */
export function useServiceAnalytics(records: RegistryRecord[]) {
  return useMemo(() => {
    // Filter records with service-level revenue
    const activeRecords = records.filter((r) => getRecordServiceAmount(r) > 0);

    if (activeRecords.length === 0) {
      return {
        totalServicesSold: 0,
        totalRevenue: 0,
        mostSoldService: null,
        leastSoldService: null,
        averageServiceValue: 0,
        collectionRate: 0,
      } as ServiceMetrics;
    }

    // Calculate basic metrics
    const totalServicesSold = activeRecords.length;
    const totalRevenue = activeRecords.reduce((sum, r) => sum + getRecordServiceAmount(r), 0);
    const totalCollected = activeRecords.reduce((sum, r) => sum + (r.amountReceived || 0), 0);
    const averageServiceValue = totalRevenue / totalServicesSold;
    const collectionRate = totalRevenue > 0 ? (totalCollected / totalRevenue) * 100 : 0;

    // Count services
    const serviceCounts = new Map<string, number>();
    activeRecords.forEach((r) => {
      const service = r.work || "Unknown";
      serviceCounts.set(service, (serviceCounts.get(service) || 0) + 1);
    });

    // Find most and least sold services
    let mostSoldService: { service: string; count: number } | null = null;
    let leastSoldService: { service: string; count: number } | null = null;

    if (serviceCounts.size > 0) {
      let maxCount = 0;
      let minCount = Infinity;

      serviceCounts.forEach((count, service) => {
        if (count > maxCount) {
          maxCount = count;
          mostSoldService = { service, count };
        }
        if (count < minCount) {
          minCount = count;
          leastSoldService = { service, count };
        }
      });
    }

    return {
      totalServicesSold,
      totalRevenue,
      mostSoldService,
      leastSoldService,
      averageServiceValue,
      collectionRate,
    } as ServiceMetrics;
  }, [records]);
}

/**
 * Hook to calculate revenue breakdown by service
 */
export function useRevenueByService(records: RegistryRecord[]): RevenueByService[] {
  return useMemo(() => {
    const serviceData = new Map<
      string,
      { revenue: number; count: number }
    >();

    records
      .filter((r) => getRecordServiceAmount(r) > 0)
      .forEach((r) => {
        const service = r.work || "Unknown";
        const current = serviceData.get(service) || { revenue: 0, count: 0 };
        serviceData.set(service, {
          revenue: current.revenue + getRecordServiceAmount(r),
          count: current.count + 1,
        });
      });

    return Array.from(serviceData.entries())
      .map(([service, { revenue, count }]) => ({
        service,
        revenue,
        servicesSold: count,
        averageValue: revenue / count,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [records]);
}

/**
 * Hook to calculate monthly comparison
 */
export function useMonthlyComparison(records: RegistryRecord[]): MonthlyData[] {
  return useMemo(() => {
    const monthlyMap = new Map<
      string,
      { revenue: number; count: number; collected: number }
    >();

    records
      .filter((r) => getRecordServiceAmount(r) > 0)
      .forEach((r) => {
        const date = new Date(r.date);
        const month = date.toLocaleString("en-IN", { year: "numeric", month: "short" });

        const current = monthlyMap.get(month) || {
          revenue: 0,
          count: 0,
          collected: 0,
        };

        monthlyMap.set(month, {
          revenue: current.revenue + getRecordServiceAmount(r),
          count: current.count + 1,
          collected: current.collected + (r.amountReceived || 0),
        });
      });

    // Sort chronologically (last 12 months or available months)
    const now = new Date();
    const last12Months: MonthlyData[] = [];

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = date.toLocaleString("en-IN", { year: "numeric", month: "short" });

      const data = monthlyMap.get(month);
      if (data) {
        last12Months.push({
          month,
          revenue: data.revenue,
          servicesSold: data.count,
          collected: data.collected,
        });
      }
    }

    return last12Months.length > 0
      ? last12Months
      : Array.from(monthlyMap.entries()).map(([month, data]) => ({
          month,
          revenue: data.revenue,
          servicesSold: data.count,
          collected: data.collected,
        }));
  }, [records]);
}

/**
 * Hook to calculate yearly comparison
 */
export function useYearlyComparison(records: RegistryRecord[]): YearlyData[] {
  return useMemo(() => {
    const yearlyMap = new Map<
      string,
      { revenue: number; count: number; collected: number }
    >();

    records
      .filter((r) => getRecordServiceAmount(r) > 0)
      .forEach((r) => {
        const year = new Date(r.date).getFullYear().toString();

        const current = yearlyMap.get(year) || {
          revenue: 0,
          count: 0,
          collected: 0,
        };

        yearlyMap.set(year, {
          revenue: current.revenue + getRecordServiceAmount(r),
          count: current.count + 1,
          collected: current.collected + (r.amountReceived || 0),
        });
      });

    return Array.from(yearlyMap.entries())
      .map(([year, data]) => ({
        year,
        revenue: data.revenue,
        servicesSold: data.count,
        collected: data.collected,
      }))
      .sort((a, b) => parseInt(b.year) - parseInt(a.year));
  }, [records]);
}

/**
 * Hook to calculate service distribution for pie chart
 */
export function useServiceDistribution(records: RegistryRecord[]): ServiceDistribution[] {
  return useMemo(() => {
    const serviceCounts = new Map<string, number>();

    const revenueRecords = records.filter((r) => getRecordServiceAmount(r) > 0);
    revenueRecords.forEach((r) => {
      const service = r.work || "Unknown";
      serviceCounts.set(service, (serviceCounts.get(service) || 0) + 1);
    });

    const total = revenueRecords.length;

    return Array.from(serviceCounts.entries())
      .map(([service, value]) => ({
        service,
        value,
        percentage: (value / total) * 100,
      }))
      .sort((a, b) => b.value - a.value);
  }, [records]);
}

export interface ClientAnalyticsRow {
  clientName: string;
  serviceCount: number;
  revenue: number;
  collected: number;
  pending: number;
  lastServiceDate: string;
}

export interface ClientBusinessMetrics {
  totalClients: number;
  totalServicesTaken: number;
  totalRevenue: number;
  totalCollected: number;
  averageMonthlyRevenue: number;
  topCustomersByRevenue: ClientAnalyticsRow[];
  topCustomersByServices: ClientAnalyticsRow[];
  categoryBreakdown: RevenueByService[];
}

function getClientKey(record: RegistryRecord): string {
  const name = record.name?.trim();
  if (name) return name;
  return record.mvNo?.trim() || "Unknown";
}

function toMonthSpan(start: Date | null, end: Date | null): number {
  if (!start || !end) return 1;
  const yearDiff = end.getFullYear() - start.getFullYear();
  const monthDiff = end.getMonth() - start.getMonth();
  return Math.max(1, yearDiff * 12 + monthDiff + 1);
}

export function useClientBusinessAnalytics(records: RegistryRecord[]): ClientBusinessMetrics {
  return useMemo(() => {
    const activeRecords = records.filter((r) => (getRecordServiceAmount(r) > 0) || (r.amountReceived && r.amountReceived > 0));

    const clientMap = new Map<
      string,
      {
        serviceCount: number;
        revenue: number;
        collected: number;
        lastServiceDate: Date | null;
      }
    >();

    let earliestRecord: Date | null = null;
    let latestRecord: Date | null = null;

    const categoryMap = new Map<string, { revenue: number; count: number }>();

    activeRecords.forEach((record) => {
      const clientName = getClientKey(record);
      const revenue = getRecordServiceAmount(record);
      const collected = record.amountReceived || 0;
      const recordDate = new Date(record.date);

      if (!earliestRecord || recordDate < earliestRecord) earliestRecord = recordDate;
      if (!latestRecord || recordDate > latestRecord) latestRecord = recordDate;

      const existing = clientMap.get(clientName) || {
        serviceCount: 0,
        revenue: 0,
        collected: 0,
        lastServiceDate: null,
      };

      clientMap.set(clientName, {
        serviceCount: existing.serviceCount + 1,
        revenue: existing.revenue + revenue,
        collected: existing.collected + collected,
        lastServiceDate:
          !existing.lastServiceDate || recordDate > existing.lastServiceDate
            ? recordDate
            : existing.lastServiceDate,
      });

      const category = record.work || "Other";
      const categoryStats = categoryMap.get(category) || { revenue: 0, count: 0 };
      categoryMap.set(category, {
        revenue: categoryStats.revenue + revenue,
        count: categoryStats.count + 1,
      });
    });

    const totalClients = clientMap.size;
    const totalServicesTaken = activeRecords.length;
    const totalRevenue = activeRecords.reduce((sum, record) => sum + getRecordServiceAmount(record), 0);
    const totalCollected = activeRecords.reduce((sum, record) => sum + (record.amountReceived || 0), 0);

    const averageMonthlyRevenue = totalRevenue / toMonthSpan(earliestRecord, latestRecord);

    const clients = Array.from(clientMap.entries()).map(([clientName, stats]) => ({
      clientName,
      serviceCount: stats.serviceCount,
      revenue: stats.revenue,
      collected: stats.collected,
      pending: Math.max(0, stats.revenue - stats.collected),
      lastServiceDate: stats.lastServiceDate ? stats.lastServiceDate.toISOString().slice(0, 10) : "—",
    }));

    const topCustomersByRevenue = clients
      .slice()
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    const topCustomersByServices = clients
      .slice()
      .sort((a, b) => b.serviceCount - a.serviceCount)
      .slice(0, 8);

    const categoryBreakdown = Array.from(categoryMap.entries())
      .map(([service, data]) => ({
        service,
        revenue: data.revenue,
        servicesSold: data.count,
        averageValue: data.count > 0 ? data.revenue / data.count : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      totalClients,
      totalServicesTaken,
      totalRevenue,
      totalCollected,
      averageMonthlyRevenue,
      topCustomersByRevenue,
      topCustomersByServices,
      categoryBreakdown,
    };
  }, [records]);
}
