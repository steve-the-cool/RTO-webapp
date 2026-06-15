import {
  collection,
  query,
  where,
  getDocs,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "./firebase";
import { normalizeServiceType, type Bucket, type RegistryRecord, type ServiceType, type RecordStatus } from "./records";

/**
 * Get all records for a specific service type across a bucket.
 * FILTERS BY: serviceType === requested value, and filters isDeleted in code.
 * This avoids requiring Firestore composite indexes.
 */
export async function getServiceClients(
  bucket: Bucket,
  serviceType: ServiceType,
): Promise<RegistryRecord[]> {
  const colName = `registry_${bucket}`;

  console.log(
    `[getServiceClients] START: Querying ${colName} for serviceType="${serviceType}"`,
  );

  try {
    // New behavior: prefer `services` array-contains query (multi-service),
    // but also include legacy `serviceType` equality results so older records
    // remain visible until migration is complete. Merge unique results.

    const resultsMap: Map<string, RegistryRecord> = new Map();

    // Query for records that have the new `services` array
    try {
      const q1 = query(collection(db, colName), where("services", "array-contains", serviceType));
      const snap1 = await getDocs(q1);
      for (const d of snap1.docs) {
        const data = d.data() as RegistryRecord;
        const rec = { id: d.id, ...data } as RegistryRecord;
        if (!rec.isDeleted) resultsMap.set(d.id, rec);
      }
    } catch (err) {
      console.warn(`[getServiceClients] services query failed for ${colName}:`, err);
    }

    // Also query legacy `serviceType` field for compatibility
    try {
      const q2 = query(collection(db, colName), where("serviceType", "==", serviceType));
      const snap2 = await getDocs(q2);
      for (const d of snap2.docs) {
        const data = d.data() as RegistryRecord;
        const rec = { id: d.id, ...data } as RegistryRecord;
        if (!rec.isDeleted) resultsMap.set(d.id, rec);
      }
    } catch (err) {
      console.warn(`[getServiceClients] serviceType legacy query failed for ${colName}:`, err);
    }

    const results = Array.from(resultsMap.values());

    console.log(
      `[getServiceClients] SUCCESS: Found ${results.length} records in ${colName} for serviceType="${serviceType}"`,
      { bucket, serviceType, count: results.length },
    );

    return results;
  } catch (error) {
    console.error(
      `[getServiceClients] ERROR: Failed to query ${colName} for serviceType="${serviceType}"`,
      { bucket, serviceType, error },
    );
    // Return empty array on error instead of throwing
    return [];
  }
}

/**
 * Get all records for a specific service type across all buckets.
 * FILTERS BY: serviceType === requested value, isDeleted !== true
 * ACROSS: clients, leads, customers buckets
 */
export async function getServiceClientsAll(
  serviceType: ServiceType,
): Promise<RegistryRecord[]> {
  console.log(`[getServiceClientsAll] START: Fetching all records for serviceType="${serviceType}"`);

  const buckets: Bucket[] = ["clients", "leads", "customers"];
  
  try {
    const allRecords = await Promise.all(
      buckets.map((b) => getServiceClients(b, serviceType)),
    );
    const flattened = allRecords.flat();

    // Validation: Ensure all results match the filter
    const totalCount = flattened.length;
    const matchCount = flattened.filter(r => r.serviceType === serviceType).length;
    
    console.log(
      `[getServiceClientsAll] SUCCESS: Retrieved ${totalCount} records across ${buckets.length} buckets`,
      {
        serviceType,
        totalRecords: totalCount,
        matchingFilter: matchCount,
        buckets: buckets.map((b, i) => ({ bucket: b, count: allRecords[i].length })),
      },
    );

    if (matchCount !== totalCount) {
      console.warn(
        `[getServiceClientsAll] WARNING: Filter mismatch detected!`,
        { expectedAll: totalCount, actualMatching: matchCount },
      );
    }

    return flattened;
  } catch (error) {
    console.error(
      `[getServiceClientsAll] ERROR: Failed to fetch records for serviceType="${serviceType}"`,
      { serviceType, error },
    );
    throw error;
  }
}

/**
 * Get service statistics for a specific service type.
 */
export async function getServiceStats(serviceType: ServiceType) {
  const records = await getServiceClientsAll(serviceType);

  const stats = {
    total: records.length,
    active: records.filter((r) => r.status === "In Progress").length,
    completed: records.filter((r) => r.status === "Completed").length,
    pending: records.filter((r) => r.status === "Pending").length,
    onHold: records.filter((r) => r.status === "On Hold").length,
  };

  return stats;
}

/**
 * Calculate total revenue for a specific service type.
 */
export async function getServiceRevenue(serviceType: ServiceType): Promise<number> {
  const records = await getServiceClientsAll(serviceType);
  return records.reduce((sum, r) => sum + (r.serviceAmount || 0), 0);
}

/**
 * Calculate total amount received for a specific service type.
 */
export async function getServiceAmountReceived(serviceType: ServiceType): Promise<number> {
  const records = await getServiceClientsAll(serviceType);
  return records.reduce((sum, r) => sum + (r.amountReceived || 0), 0);
}

/**
 * Calculate pending amount for a specific service type.
 */
export async function getServicePendingAmount(serviceType: ServiceType): Promise<number> {
  const revenue = await getServiceRevenue(serviceType);
  const received = await getServiceAmountReceived(serviceType);
  return revenue - received;
}

/**
 * Get records with upcoming service renewals (within N days).
 */
export async function getUpcomingRenewals(daysFromNow: number = 30): Promise<RegistryRecord[]> {
  const buckets: Bucket[] = ["clients", "leads", "customers"];
  const allRecords = await Promise.all(
    buckets.map(async (b) => {
      const colName = `registry_${b}`;
      const q = query(
        collection(db, colName),
        where("isDeleted", "!=", true),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RegistryRecord));
    }),
  );

  const flatRecords = allRecords.flat();
  const now = new Date();
  const futureDate = new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000);

  return flatRecords.filter((r) => {
    if (!r.serviceDueDate) return false;
    const dueDate = new Date(r.serviceDueDate);
    return dueDate >= now && dueDate <= futureDate;
  });
}

/**
 * Get total revenue across all services.
 */
export async function getTotalRevenue(): Promise<number> {
  const buckets: Bucket[] = ["clients", "leads", "customers"];
  const allRecords = await Promise.all(
    buckets.map(async (b) => {
      const colName = `registry_${b}`;
      const q = query(
        collection(db, colName),
        where("isDeleted", "!=", true),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RegistryRecord));
    }),
  );

  const flatRecords = allRecords.flat();
  return flatRecords.reduce((sum, r) => sum + (r.serviceAmount || 0), 0);
}

/**
 * Get count of active services across all buckets.
 */
export async function getActiveServicesCount(): Promise<number> {
  const buckets: Bucket[] = ["clients", "leads", "customers"];
  const allRecords = await Promise.all(
    buckets.map(async (b) => {
      const colName = `registry_${b}`;
      const q = query(
        collection(db, colName),
        where("isDeleted", "!=", true),
        where("status", "==", "In Progress"),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RegistryRecord));
    }),
  );

  return allRecords.flat().length;
}

/**
 * Get revenue breakdown by service type.
 */
export async function getRevenueByService() {
  const serviceTypes = [
    "Insurance",
    "Fitness",
    "Gujarat Permit",
    "National Permit",
    "Tax",
    "PUC",
    "License",
    "RC Transfer",
    "HP Addition",
    "HP Termination",
  ] as const;

  const revenues = await Promise.all(
    serviceTypes.map(async (type) => ({
      service: type,
      revenue: await getServiceRevenue(type),
    })),
  );

  return revenues.filter((r) => r.revenue > 0);
}

// ─── Validation & Debugging Helpers ───────────────────────────────────────────

/**
 * Validate service filtering for a specific record.
 * Use for debugging to ensure a record appears in the correct service module only.
 * 
 * Example: validateRecordInService("client-123", "Insurance")
 */
export async function validateRecordInService(
  recordId: string,
  expectedServiceType: string,
): Promise<{ isValid: boolean; message: string; details: any }> {
  console.log(
    `[validateRecordInService] Checking if record "${recordId}" belongs to service "${expectedServiceType}"`,
  );

  const buckets: Bucket[] = ["clients", "leads", "customers"];

  try {
    // Find the record across all buckets
    let targetRecord: RegistryRecord | null = null;
    let targetBucket: Bucket | null = null;

    for (const bucket of buckets) {
      const colName = `registry_${bucket}`;
      const docSnap = await getDocs(
        query(collection(db, colName), where("id", "==", recordId)),
      );
      
      if (!docSnap.empty) {
        targetRecord = { id: docSnap.docs[0].id, ...docSnap.docs[0].data() } as RegistryRecord;
        targetBucket = bucket;
        break;
      }
    }

    if (!targetRecord) {
      return {
        isValid: false,
        message: `Record "${recordId}" not found in any bucket`,
        details: { recordId, expectedServiceType },
      };
    }

    const actualServiceType = targetRecord.serviceType;
    const isValid = actualServiceType === expectedServiceType;

    console.log(
      `[validateRecordInService] ${isValid ? "✓ VALID" : "✗ INVALID"}`,
      {
        recordId,
        bucket: targetBucket,
        clientName: targetRecord.name,
        expectedServiceType,
        actualServiceType,
      },
    );

    return {
      isValid,
      message: isValid
        ? `✓ Record "${targetRecord.name}" correctly has serviceType="${expectedServiceType}"`
        : `✗ Record "${targetRecord.name}" has serviceType="${actualServiceType}" but expected "${expectedServiceType}"`,
      details: {
        recordId,
        bucket: targetBucket,
        clientName: targetRecord.name,
        expectedServiceType,
        actualServiceType,
        mvNo: targetRecord.mvNo,
      },
    };
  } catch (error) {
    console.error(`[validateRecordInService] Error validating record:`, error);
    return {
      isValid: false,
      message: `Error validating record: ${error instanceof Error ? error.message : "Unknown error"}`,
      details: { recordId, expectedServiceType, error },
    };
  }
}

/**
 * Get a summary of all records grouped by service type.
 * Use this to verify the complete distribution of records across services.
 * 
 * Example: const summary = await getServiceDistributionSummary();
 */
export async function getServiceDistributionSummary() {
  console.log(`[getServiceDistributionSummary] Building distribution summary...`);

  const serviceTypes = [
    "Insurance",
    "Fitness",
    "Gujarat Permit",
    "National Permit",
    "Tax",
    "PUC",
    "License",
    "RC Transfer",
    "HP Addition",
    "HP Termination",
  ] as const;

  const distribution = await Promise.all(
    serviceTypes.map(async (type) => ({
      serviceType: type,
      count: (await getServiceClientsAll(type)).length,
    })),
  );

  const totalRecords = distribution.reduce((sum, d) => sum + d.count, 0);

  console.log(
    `[getServiceDistributionSummary] Complete: ${totalRecords} total records across ${serviceTypes.length} services`,
    distribution,
  );

  return {
    totalRecords,
    totalServices: serviceTypes.length,
    distribution,
    summary: distribution
      .filter((d) => d.count > 0)
      .map((d) => `${d.serviceType}: ${d.count}`)
      .join(", "),
  };
}
