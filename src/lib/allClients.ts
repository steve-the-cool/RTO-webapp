// All Clients — Aggregates client data from all buckets with service history and metrics.
import { subscribeToRecords, getRecordServiceDetails, type RegistryRecord, type Bucket } from "./records";
import { subscribeToCustomers, type CustomerProfile } from "./customers";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClientService {
  id: string;
  bucket: Bucket;
  date: string;
  application: string;
  work: string;
  status: RegistryRecord["status"];
  serviceType?: string;
  dueDate?: string;
  serviceAmount?: number;
  amountReceived?: number;
  paymentStatus?: RegistryRecord["paymentStatus"];
  activityLogs?: RegistryRecord["activityLogs"];
}

export interface AggregatedClient {
  id: string; // Unique identifier (name-based)
  name: string;
  groupName?: string;
  mobile: string;
  email?: string;
  address?: string;
  vehicles: string[]; // Vehicle numbers
  allServices: ClientService[]; // All services across all buckets
  activeServices: number; // In Progress + Pending
  pendingServices: number; // Pending or On Hold
  completedServices: number; // Completed
  assignee?: string; // Latest assignee
  totalRevenue: number; // Sum of all serviceAmount
  totalReceived: number; // Sum of all amountReceived
  pendingRevenue: number; // totalRevenue - totalReceived
  lastActivityDate?: string; // Most recent service date
  createdAt?: string; // Earliest record creation date
  serviceTypes: string[]; // Aggregated service types
  statuses: string[]; // Aggregated service statuses
  isActive: boolean; // Has recent activity
  paymentStatus: "Paid" | "Partial" | "Unpaid";
}

// ─── Data aggregation ─────────────────────────────────────────────────────────

/**
 * Aggregate all records from all buckets and customers into a unified client view.
 */
export function aggregateAllClients(
  recordsByBucket: { [key in Bucket]: RegistryRecord[] },
  customers: CustomerProfile[],
): AggregatedClient[] {
  const clientMap = new Map<string, AggregatedClient>();

  // Process all records from all buckets
  const allRecords = Object.values(recordsByBucket).flat();

  for (const record of allRecords) {
    const key = record.name.toLowerCase();
    let client = clientMap.get(key);

    if (!client) {
      client = {
        id: key,
        name: record.name,
        groupName: record.groupName,
        mobile: record.mo || "",
        email: "",
        address: "",
        vehicles: [],
        allServices: [],
        activeServices: 0,
        pendingServices: 0,
        completedServices: 0,
        assignee: record.assignee,
        totalRevenue: 0,
        totalReceived: 0,
        pendingRevenue: 0,
        lastActivityDate: undefined,
        createdAt: undefined,
        serviceTypes: [],
        statuses: [],
        isActive: true,
        paymentStatus: "Unpaid",
      };
      clientMap.set(key, client);
    }

    // Add vehicle if not already present
    if (record.mvNo && !client.vehicles.includes(record.mvNo)) {
      client.vehicles.push(record.mvNo);
    }

    // Add one service entry per service detail in the record
    const serviceDetails = getRecordServiceDetails(record);

    for (const detail of serviceDetails) {
      const service: ClientService = {
        id: `${record.id}-${detail.serviceType ?? "unknown"}-${detail.dueDate ?? ""}`,
        bucket: Object.entries(recordsByBucket).find(
          ([, records]) => records.includes(record),
        )?.[0] as Bucket,
        date: record.date,
        application: record.application,
        work: record.work,
        status: detail.status || record.status,
        serviceType: detail.serviceType,
        dueDate: detail.dueDate,
        serviceAmount: record.serviceAmount,
        amountReceived: record.amountReceived,
        paymentStatus: record.paymentStatus,
        activityLogs: record.activityLogs,
      };

      client.allServices.push(service);

      if (detail.serviceType && !client.serviceTypes.includes(detail.serviceType)) {
        client.serviceTypes.push(detail.serviceType);
      }
      if (detail.status && !client.statuses.includes(detail.status)) {
        client.statuses.push(detail.status);
      }
    }

    // Update status counts using record status as the primary indicator for active/pending/completed service metrics
    if (record.status === "In Progress" || record.status === "Pending") {
      client.activeServices += 1;
    }
    if (record.status === "Pending" || record.status === "On Hold") {
      client.pendingServices += 1;
    }
    if (record.status === "Completed") {
      client.completedServices += 1;
    }

    // Update revenue
    if (record.serviceAmount) {
      client.totalRevenue += record.serviceAmount;
    }
    if (record.amountReceived) {
      client.totalReceived += record.amountReceived;
    }

    // Update latest assignee
    if (record.assignee) {
      client.assignee = record.assignee;
    }

    // Track latest activity
    if (!client.lastActivityDate || record.date > client.lastActivityDate) {
      client.lastActivityDate = record.date;
    }

    // Track earliest createdAt
    if (record.createdAt) {
      const currentCreated = client.createdAt ? new Date(client.createdAt) : null;
      const recordCreated = new Date(record.createdAt);
      if (!client.createdAt || (currentCreated && recordCreated < currentCreated)) {
        client.createdAt = record.createdAt;
      }
    } else if (!client.createdAt) {
      client.createdAt = record.date;
    }

    // Track service status metadata from the record status
    if (record.status && !client.statuses.includes(record.status)) {
      client.statuses.push(record.status);
    }
  }

  // Add customer data
  for (const customer of customers) {
    const key = customer.name.toLowerCase();
    let client = clientMap.get(key);

    if (!client) {
      client = {
        id: key,
        name: customer.name,
        groupName: undefined,
        mobile: customer.mobile || "",
        email: customer.email || "",
        address: customer.address || "",
        vehicles: customer.vehicles.map((v) => v.mvNo),
        allServices: [],
        activeServices: 0,
        pendingServices: 0,
        completedServices: 0,
        assignee: undefined,
        totalRevenue: 0,
        totalReceived: 0,
        pendingRevenue: 0,
        lastActivityDate: undefined,
        isActive: false,
        paymentStatus: "Unpaid",
      };
      clientMap.set(key, client);
    } else {
      // Merge customer data
      if (customer.email && !client.email) {
        client.email = customer.email;
      }
      if (customer.address && !client.address) {
        client.address = customer.address;
      }
      if (customer.mobile && !client.mobile) {
        client.mobile = customer.mobile;
      }

      // Add unique vehicles
      for (const vehicle of customer.vehicles) {
        if (!client.vehicles.includes(vehicle.mvNo)) {
          client.vehicles.push(vehicle.mvNo);
        }
      }
    }
  }

  // Finalize clients and sort by name
  const clients = Array.from(clientMap.values());

  // Calculate pending revenue and payment status
  for (const client of clients) {
    client.pendingRevenue = client.totalRevenue - client.totalReceived;

    if (client.totalRevenue === 0) {
      client.paymentStatus = "Unpaid";
    } else if (client.totalReceived >= client.totalRevenue) {
      client.paymentStatus = "Paid";
    } else if (client.totalReceived > 0) {
      client.paymentStatus = "Partial";
    } else {
      client.paymentStatus = "Unpaid";
    }

    // Check if active (activity in last 30 days)
    if (client.lastActivityDate) {
      const lastDate = new Date(client.lastActivityDate);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      client.isActive = lastDate > thirtyDaysAgo;
    }
  }

  return clients.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Subscribe to all clients with live updates.
 * Automatically aggregates data from all buckets and customers.
 */
export function subscribeToAllClients(
  callback: (clients: AggregatedClient[]) => void,
): () => void {
  const buckets: Bucket[] = ["clients", "leads"];
  const recordsByBucket: { [key in Bucket]?: RegistryRecord[] } = {
    clients: [],
    leads: [],
  };
  let allCustomers: CustomerProfile[] = [];

  // Track readiness for each data source
  let ready = {
    clients: false,
    leads: false,
    profiles: false,
  };

  let initialLoadComplete = false;
  let errorState = false;

  const unsubscribers: Array<() => void> = [];

  const safeAggregate = () => {
    try {
      return aggregateAllClients(recordsByBucket as { [key in Bucket]: RegistryRecord[] }, allCustomers);
    } catch (error) {
      console.error("[subscribeToAllClients] Failed to aggregate clients:", error);
      errorState = true;
      return [] as AggregatedClient[];
    }
  };

  /**
   * Check if all data sources are ready and trigger update if so
   */
  const checkAndUpdate = () => {
    const allReady = ready.clients && ready.leads && ready.profiles;

    if (allReady) {
      initialLoadComplete = true;
      const clients = safeAggregate();
      callback(clients);
    }
  };

  // Subscribe to records
  buckets.forEach((bucket) => {
    const unsub = subscribeToRecords(
      bucket,
      (records) => {
        recordsByBucket[bucket] = records;
        ready[bucket] = true;

        // After initial load, always update
        if (initialLoadComplete) {
          const clients = safeAggregate();
          callback(clients);
        } else {
          // During initial load, wait for all sources
          checkAndUpdate();
        }
      },
      (error) => {
        console.warn(`[subscribeToAllClients] ${bucket} subscription failed, continuing with empty records.`, error);
        ready[bucket] = true;
        if (initialLoadComplete) {
          const clients = safeAggregate();
          callback(clients);
        } else {
          checkAndUpdate();
        }
      },
    );
    unsubscribers.push(unsub);
  });

  // Subscribe to customers
  const unsub = subscribeToCustomers(
    (customers) => {
      allCustomers = customers;
      ready.profiles = true;

      // After initial load, always update
      if (initialLoadComplete) {
        const clients = safeAggregate();
        callback(clients);
      } else {
        // During initial load, wait for all sources
        checkAndUpdate();
      }
    },
    (error) => {
      console.warn("[subscribeToAllClients] Customer subscription failed, continuing with empty profiles.", error);
      ready.profiles = true;
      if (initialLoadComplete) {
        const clients = safeAggregate();
        callback(clients);
      } else {
        checkAndUpdate();
      }
    },
  );
  unsubscribers.push(unsub);

  const timeoutId = globalThis.setTimeout(() => {
    if (!initialLoadComplete) {
      console.warn("[subscribeToAllClients] initial load timed out, returning empty client list.");
      initialLoadComplete = true;
      callback([]);
    }
  }, 8000);

  return () => {
    globalThis.clearTimeout(timeoutId);
    unsubscribers.forEach((u) => u());
  };
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

export function filterClients(
  clients: AggregatedClient[],
  searchQuery: string,
  filters: {
    status?: "active" | "inactive";
    paymentStatus?: AggregatedClient["paymentStatus"];
    serviceType?: string;
    serviceStatus?: string;
    groupName?: string;
    vehicleNumber?: string;
    mobileNumber?: string;
    clientName?: string;
    assignedTo?: string;
    dueDateStart?: string;
    dueDateEnd?: string;
    createdStart?: string;
    createdEnd?: string;
  },
): AggregatedClient[] {
  let result = clients;

  const dateInRange = (value: string | undefined, start?: string, end?: string) => {
    if (!value) return false;
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) return false;
    if (start) {
      const startDate = new Date(start);
      startDate.setHours(0, 0, 0, 0);
      if (parsed < startDate) return false;
    }
    if (end) {
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
      if (parsed > endDate) return false;
    }
    return true;
  };

  // Apply search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter((c) =>
      [c.name, c.mobile, c.groupName, c.assignee, ...c.vehicles]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q)) ||
      c.serviceTypes.some((type) => typeof type === "string" && type.toLowerCase().includes(q)) ||
      c.statuses.some((status) => typeof status === "string" && status.toLowerCase().includes(q)) ||
      c.allServices.some((service) =>
        [service.work, service.application, service.serviceType, service.status, service.dueDate]
          .filter(Boolean)
          .some((value) => typeof value === "string" && value.toLowerCase().includes(q)),
      ),
    );
  }

  if (filters.clientName) {
    const q = filters.clientName.toLowerCase();
    result = result.filter((c) => c.name.toLowerCase().includes(q));
  }

  if (filters.groupName) {
    const q = filters.groupName.toLowerCase();
    result = result.filter((c) => (c.groupName ?? "").toLowerCase().includes(q));
  }

  if (filters.vehicleNumber) {
    const q = filters.vehicleNumber.toLowerCase();
    result = result.filter((c) =>
      c.vehicles.some((v) => v.toLowerCase().includes(q)),
    );
  }

  if (filters.mobileNumber) {
    const q = filters.mobileNumber.toLowerCase();
    result = result.filter((c) => c.mobile.toLowerCase().includes(q));
  }

  if (filters.assignedTo) {
    const q = filters.assignedTo.toLowerCase();
    result = result.filter(
      (c) => (c.assignee ?? "").toLowerCase().includes(q),
    );
  }

  if (filters.serviceType && filters.serviceStatus) {
    const typeQuery = filters.serviceType.toLowerCase();
    const statusQuery = filters.serviceStatus.toLowerCase();
    result = result.filter((c) =>
      c.allServices.some(
        (service) =>
          typeof service.serviceType === "string" &&
          service.serviceType.toLowerCase() === typeQuery &&
          typeof service.status === "string" &&
          service.status.toLowerCase() === statusQuery,
      ),
    );
  } else if (filters.serviceType) {
    const q = filters.serviceType.toLowerCase();
    result = result.filter((c) =>
      c.allServices.some(
        (service) =>
          typeof service.serviceType === "string" &&
          service.serviceType.toLowerCase() === q,
      ),
    );
  } else if (filters.serviceStatus) {
    const q = filters.serviceStatus.toLowerCase();
    result = result.filter((c) =>
      c.allServices.some(
        (service) =>
          typeof service.status === "string" &&
          service.status.toLowerCase() === q,
      ),
    );
  }

  if (filters.dueDateStart || filters.dueDateEnd) {
    result = result.filter((c) =>
      c.allServices.some((service) =>
        dateInRange(service.dueDate, filters.dueDateStart, filters.dueDateEnd),
      ),
    );
  }

  if (filters.createdStart || filters.createdEnd) {
    result = result.filter((c) =>
      dateInRange(c.createdAt, filters.createdStart, filters.createdEnd),
    );
  }

  if (filters.status === "active") {
    result = result.filter((c) => c.isActive);
  } else if (filters.status === "inactive") {
    result = result.filter((c) => !c.isActive);
  }

  if (filters.paymentStatus) {
    result = result.filter((c) => c.paymentStatus === filters.paymentStatus);
  }

  return result;
}
