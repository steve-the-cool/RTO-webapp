// All Clients — Aggregates client data from all buckets with service history and metrics.
import { subscribeToRecords, type RegistryRecord, type Bucket } from "./records";
import { subscribeToCustomers, type CustomerProfile } from "./customers";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClientService {
  id: string;
  bucket: Bucket;
  date: string;
  application: string;
  work: string;
  status: RegistryRecord["status"];
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
        isActive: true,
        paymentStatus: "Unpaid",
      };
      clientMap.set(key, client);
    }

    // Add vehicle if not already present
    if (record.mvNo && !client.vehicles.includes(record.mvNo)) {
      client.vehicles.push(record.mvNo);
    }

    // Add service
    const service: ClientService = {
      id: record.id,
      bucket: Object.entries(recordsByBucket).find(
        ([, records]) => records.includes(record),
      )?.[0] as Bucket,
      date: record.date,
      application: record.application,
      work: record.work,
      status: record.status,
      serviceAmount: record.serviceAmount,
      amountReceived: record.amountReceived,
      paymentStatus: record.paymentStatus,
      activityLogs: record.activityLogs,
    };

    client.allServices.push(service);

    // Update status counts
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
  const buckets: Bucket[] = ["clients", "leads", "customers"];
  const recordsByBucket: { [key in Bucket]: RegistryRecord[] } = {
    clients: [],
    leads: [],
    customers: [],
  };
  let allCustomers: CustomerProfile[] = [];

  // Track readiness for each data source
  let ready = {
    clients: false,
    leads: false,
    customers: false,
    profiles: false,
  };

  let initialLoadComplete = false;

  const unsubscribers: Array<() => void> = [];

  /**
   * Check if all data sources are ready and trigger update if so
   */
  const checkAndUpdate = () => {
    const allReady = ready.clients && ready.leads && ready.customers && ready.profiles;

    if (allReady) {
      initialLoadComplete = true;
      const clients = aggregateAllClients(recordsByBucket, allCustomers);
      callback(clients);
    }
  };

  // Subscribe to records
  buckets.forEach((bucket) => {
    const unsub = subscribeToRecords(bucket, (records) => {
      recordsByBucket[bucket] = records;
      ready[bucket] = true;

      // After initial load, always update
      if (initialLoadComplete) {
        const clients = aggregateAllClients(recordsByBucket, allCustomers);
        callback(clients);
      } else {
        // During initial load, wait for all sources
        checkAndUpdate();
      }
    });
    unsubscribers.push(unsub);
  });

  // Subscribe to customers
  const unsub = subscribeToCustomers((customers) => {
    allCustomers = customers;
    ready.profiles = true;

    // After initial load, always update
    if (initialLoadComplete) {
      const clients = aggregateAllClients(recordsByBucket, allCustomers);
      callback(clients);
    } else {
      // During initial load, wait for all sources
      checkAndUpdate();
    }
  });
  unsubscribers.push(unsub);

  return () => unsubscribers.forEach((u) => u());
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

export function filterClients(
  clients: AggregatedClient[],
  searchQuery: string,
  filters: {
    status?: "active" | "inactive";
    paymentStatus?: AggregatedClient["paymentStatus"];
  },
): AggregatedClient[] {
  let result = clients;

  // Apply search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter((c) =>
      [c.name, c.mobile, c.groupName, ...c.vehicles].some((v) =>
        (v ?? "").toLowerCase().includes(q),
      ),
    );
  }

  // Apply filters
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
