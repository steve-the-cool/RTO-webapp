// Migration utility: Populate serviceType on existing records
// Run this once to update all existing records with serviceType

import {
  collection,
  getDocs,
  updateDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { normalizeServiceType, type Bucket, type RegistryRecord, SERVICE_TYPES } from "./records";

/**
 * Migrate existing records to add serviceType field.
 * Maps from work/application description to serviceType.
 * 
 * Example usage (run once in browser console):
 * import { migrateExistingRecords } from '@/lib/migration';
 * await migrateExistingRecords();
 */
export async function migrateExistingRecords(): Promise<{
  bucket: Bucket;
  processed: number;
  updated: number;
  failed: number;
}[]> {
  const buckets: Bucket[] = ["clients", "leads", "customers"];
  const results: {
    bucket: Bucket;
    processed: number;
    updated: number;
    failed: number;
  }[] = [];

  for (const bucket of buckets) {
    console.log(
      `\n[MIGRATION] Processing bucket: ${bucket}`,
    );

    const colName = `registry_${bucket}`;
    const snap = await getDocs(collection(db, colName));

    let processed = 0;
    let updated = 0;
    let failed = 0;

    for (const docSnap of snap.docs) {
      const record = docSnap.data() as RegistryRecord;
      processed++;

      // Skip if already has serviceType
      if (record.serviceType && record.serviceType.trim()) {
        console.log(
          `[MIGRATION] ${bucket}/${record.id}: Already has serviceType="${record.serviceType}", skipping`,
        );
        continue;
      }

      try {
        // Infer serviceType from work/application description
        const inferredType = inferServiceTypeFromWork(record.work, record.application);

        if (!inferredType) {
          console.warn(
            `[MIGRATION] ${bucket}/${record.id} (${record.name}): Could not infer serviceType from work="${record.work}" application="${record.application}"`,
          );
          continue;
        }

        // Update the record
        await updateDoc(doc(db, colName, docSnap.id), {
          serviceType: inferredType,
        });

        console.log(
          `[MIGRATION] ${bucket}/${record.id} (${record.name}): Updated serviceType="${inferredType}"`,
        );
        updated++;
      } catch (error) {
        console.error(
          `[MIGRATION] ${bucket}/${record.id} (${record.name}): ERROR`,
          error,
        );
        failed++;
      }
    }

    console.log(
      `[MIGRATION] ${bucket}: Processed=${processed}, Updated=${updated}, Failed=${failed}`,
    );

    results.push({
      bucket,
      processed,
      updated,
      failed,
    });
  }

  console.log(
    `\n[MIGRATION] COMPLETE`,
    results,
  );

  return results;
}

/**
 * Infer serviceType from work and application descriptions.
 * Uses keyword matching to guess the service type.
 */
function inferServiceTypeFromWork(
  work?: string,
  application?: string,
): string | null {
  const combined = `${work || ""} ${application || ""}`.toLowerCase();

  // Map of keywords to service types
  const patterns: Array<[string[], string]> = [
    (
      [
        "insurance",
        "policy",
      ],
      "Insurance"
    ),
    (
      [
        "fitness",
        "emission",
        "fitness test",
      ],
      "Fitness"
    ),
    (
      [
        "permit",
        "commercial",
      ],
      "Permit"
    ),
    (
      [
        "gujarat permit",
      ],
      "Gujarat Permit"
    ),
    (
      [
        "national permit",
      ],
      "National Permit"
    ),
    (
      [
        "tax",
      ],
      "Tax"
    ),
    (
      [
        "puc",
        "pollution",
      ],
      "PUC"
    ),
    (
      [
        "license",
        "registration",
      ],
      "License"
    ),
    (
      [
        "rc transfer",
        "ownership transfer",
        "transfer",
      ],
      "RC Transfer"
    ),
    (
      [
        "hp addition",
        "hp add",
      ],
      "HP Addition"
    ),
    (
      [
        "hp termination",
        "hp term",
      ],
      "HP Termination"
    ),
  ];

  for (const [keywords, serviceType] of patterns) {
    if (keywords.some((kw) => combined.includes(kw))) {
      return serviceType;
    }
  }

  return null;
}

/**
 * Manually assign serviceType to records.
 * Use this to update records that couldn't be auto-migrated.
 * 
 * Example:
 * await updateRecordServiceType('clients', 'record-id-123', 'Insurance');
 */
export async function updateRecordServiceType(
  bucket: Bucket,
  recordId: string,
  serviceType: string,
): Promise<void> {
  const normalized = normalizeServiceType(serviceType);

  if (!normalized) {
    throw new Error(
      `Invalid serviceType: "${serviceType}". Valid types: ${SERVICE_TYPES.join(", ")}`,
    );
  }

  const colName = `registry_${bucket}`;
  await updateDoc(doc(db, colName, recordId), {
    serviceType: normalized,
  });

  console.log(
    `[MIGRATION] Updated ${bucket}/${recordId}: serviceType="${normalized}"`,
  );
}

/**
 * Get all records without serviceType (unmigrated records).
 */
export async function getUnmigratedRecords(): Promise<
  Array<{
    bucket: Bucket;
    id: string;
    name: string;
    work?: string;
    application?: string;
  }>
> {
  const buckets: Bucket[] = ["clients", "leads", "customers"];
  const unmigrated: Array<{
    bucket: Bucket;
    id: string;
    name: string;
    work?: string;
    application?: string;
  }> = [];

  for (const bucket of buckets) {
    const colName = `registry_${bucket}`;
    const snap = await getDocs(collection(db, colName));

    for (const docSnap of snap.docs) {
      const record = docSnap.data() as RegistryRecord;

      // If serviceType is missing or empty, it needs migration
      if (!record.serviceType || !record.serviceType.trim()) {
        unmigrated.push({
          bucket,
          id: docSnap.id,
          name: record.name,
          work: record.work,
          application: record.application,
        });
      }
    }
  }

  return unmigrated;
}

/**
 * Get migration status summary.
 */
export async function getMigrationStatus(): Promise<{
  totalRecords: number;
  migratedRecords: number;
  unmigratedRecords: number;
  migrationPercentage: number;
  unmigratedDetails: Array<{
    bucket: Bucket;
    id: string;
    name: string;
    work?: string;
  }>;
}> {
  const buckets: Bucket[] = ["clients", "leads", "customers"];
  let totalRecords = 0;
  let migratedRecords = 0;
  const unmigratedDetails: Array<{
    bucket: Bucket;
    id: string;
    name: string;
    work?: string;
  }> = [];

  for (const bucket of buckets) {
    const colName = `registry_${bucket}`;
    const snap = await getDocs(collection(db, colName));

    for (const docSnap of snap.docs) {
      const record = docSnap.data() as RegistryRecord;
      totalRecords++;

      if (record.serviceType && record.serviceType.trim()) {
        migratedRecords++;
      } else {
        unmigratedDetails.push({
          bucket,
          id: docSnap.id,
          name: record.name,
          work: record.work,
        });
      }
    }
  }

  const migrationPercentage =
    totalRecords > 0 ? Math.round((migratedRecords / totalRecords) * 100) : 0;

  console.log(
    `[MIGRATION STATUS] Total: ${totalRecords}, Migrated: ${migratedRecords}, Unmigrated: ${totalRecords - migratedRecords}, Percentage: ${migrationPercentage}%`,
    { unmigratedDetails },
  );

  return {
    totalRecords,
    migratedRecords,
    unmigratedRecords: totalRecords - migratedRecords,
    migrationPercentage,
    unmigratedDetails,
  };
}
