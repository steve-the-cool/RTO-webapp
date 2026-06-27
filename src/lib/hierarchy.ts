import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  getDoc,
  addDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { removeUndefined, type ServiceType } from "./records";
import { getSession } from "./auth";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  mobile: string;
  address: string;
  companyName: string;
  gstNumber: string;
  notes: string;
  type: "client" | "lead";
  createdAt?: string;
  updatedAt?: string;
}

export interface VehicleDocument {
  id: string;
  fileName: string;
  fileUrl: string;
  storagePath: string;
  uploadedAt: string;
  uploadedBy: string;
  fileType: string;
}

export interface Vehicle {
  id: string;
  clientId: string;
  vehicleNumber: string;
  vehicleType: string;
  chassisNumber: string;
  engineNumber: string;
  registrationDate: string;
  status: "Pending" | "In Progress" | "Completed" | "On Hold";
  createdAt?: string;
  updatedAt?: string;
  documents?: VehicleDocument[];
}

export type ServiceTaskStatus =
  | "Not Started"
  | "Documents Collected"
  | "Verification"
  | "Submitted"
  | "Approved"
  | "Completed";

export interface Service {
  id: string;
  vehicleId: string;
  serviceType: ServiceType;
  dueDate: string;
  serviceAmount: number;
  amountReceived: number;
  pendingAmount: number; // serviceAmount - amountReceived
  assignedStaff: string;
  taskStatus: ServiceTaskStatus;
  progress: number; // mapped from taskStatus
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientAccounting {
  totalAmount: number;
  amountReceived: number;
  pendingAmount: number;
}

export interface ClientDetails extends Client {
  vehicles: (Vehicle & { services: Service[] })[];
  accounting: ClientAccounting;
}

// ─── Constants & Collection Names ───────────────────────────────────────────

export const CLIENTS_COL = "registry_clients_v2";
export const VEHICLES_COL = "registry_vehicles_v2";
export const SERVICES_COL = "registry_services_v2";

export const TASK_STATUS_PROGRESS: Record<ServiceTaskStatus, number> = {
  "Not Started": 0,
  "Documents Collected": 20,
  Verification: 40,
  Submitted: 60,
  Approved: 80,
  Completed: 100,
};

// ─── Helper Functions ────────────────────────────────────────────────────────

export function getProgressFromStatus(status: ServiceTaskStatus): number {
  return TASK_STATUS_PROGRESS[status] ?? 0;
}

// ─── Client Operations ────────────────────────────────────────────────────────

/** Subscribe to clients of a specific type (client/lead). */
export function subscribeToClients(
  type: "client" | "lead",
  cb: (clients: Client[]) => void,
  errorCb?: (error: unknown) => void,
): () => void {
  const q = query(collection(db, CLIENTS_COL), where("type", "==", type));
  return onSnapshot(
    q,
    (snap) => {
      const clients = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Client);
      cb(clients.sort((a, b) => a.name.localeCompare(b.name)));
    },
    (error) => {
      console.error(`[subscribeToClients] type=${type} failed:`, error);
      if (errorCb) errorCb(error);
      cb([]);
    },
  );
}

/** Subscribe to all clients. */
export function subscribeAllClients(
  cb: (clients: Client[]) => void,
  errorCb?: (error: unknown) => void,
): () => void {
  const q = query(collection(db, CLIENTS_COL));
  return onSnapshot(
    q,
    (snap) => {
      const clients = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Client);
      cb(clients.sort((a, b) => a.name.localeCompare(b.name)));
    },
    (error) => {
      console.error("[subscribeAllClients] failed:", error);
      if (errorCb) errorCb(error);
      cb([]);
    },
  );
}

export async function logActivity(
  clientId: string,
  action: string,
  fieldName: string | null,
  oldValue: string | null,
  newValue: string | null,
  actorOverride?: { name: string; uid: string; role: string },
): Promise<void> {
  try {
    const session = getSession();
    const performedBy = actorOverride?.name ?? session?.name ?? "System";
    const performedById = actorOverride?.uid ?? session?.uid ?? "system";
    const performedByRole = actorOverride?.role ?? session?.role ?? "admin";
    const performedAt = new Date().toISOString();

    await addDoc(collection(db, "client_activity_logs"), {
      clientId,
      action,
      fieldName: fieldName || null,
      oldValue: oldValue || null,
      newValue: newValue || null,
      performedBy,
      performedById,
      performedByRole,
      performedAt,
    });
  } catch (err) {
    console.error("[logActivity] Failed to write client_activity_logs:", err);
  }
}

/** Upsert a client doc. */
export async function saveClient(
  client: Client,
  actorOverride?: { name: string; uid: string; role: string },
): Promise<void> {
  const { id, ...data } = client;
  const now = new Date().toISOString();
  const docRef = doc(db, CLIENTS_COL, id);

  const session = getSession();
  const actorName = actorOverride?.name ?? session?.name ?? "System";
  const actorId = actorOverride?.uid ?? session?.uid ?? "system";

  // Check if client doc exists
  const existingSnap = await getDoc(docRef);
  const existing = existingSnap.exists() ? (existingSnap.data() as Client) : null;

  const isNew = !existing;

  const cleanData = removeUndefined({
    ...data,
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? actorName,
    createdById: existing?.createdById ?? actorId,
    updatedAt: now,
    updatedBy: actorName,
    updatedById: actorId,
  });

  await setDoc(docRef, cleanData, { merge: true });

  // Log activity
  if (isNew) {
    await logActivity(id, "Created Client", null, null, null, actorOverride);
  } else if (existing) {
    // Compare fields
    const fieldsToTrack: (keyof Client)[] = [
      "name",
      "mobile",
      "address",
      "companyName",
      "gstNumber",
      "notes",
    ];
    for (const f of fieldsToTrack) {
      const oldVal = existing[f] || "";
      const newVal = client[f] || "";
      if (oldVal !== newVal) {
        await logActivity(id, "Updated Details", f, String(oldVal), String(newVal), actorOverride);
      }
    }
  }
}

/** Delete a client doc. */
export async function deleteClient(id: string): Promise<void> {
  await deleteDoc(doc(db, CLIENTS_COL, id));
}

// ─── Vehicle Operations ───────────────────────────────────────────────────────

/** Subscribe to vehicles for a specific client. */
export function subscribeToVehiclesForClient(
  clientId: string,
  cb: (vehicles: Vehicle[]) => void,
): () => void {
  const q = query(collection(db, VEHICLES_COL), where("clientId", "==", clientId));
  return onSnapshot(
    q,
    (snap) => {
      const vehicles = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Vehicle);
      cb(vehicles.sort((a, b) => a.vehicleNumber.localeCompare(b.vehicleNumber)));
    },
    (error) => {
      console.error(`[subscribeToVehiclesForClient] client=${clientId} failed:`, error);
      cb([]);
    },
  );
}

/** Subscribe to all vehicles. */
export function subscribeAllVehicles(cb: (vehicles: Vehicle[]) => void): () => void {
  const q = query(collection(db, VEHICLES_COL));
  return onSnapshot(
    q,
    (snap) => {
      const vehicles = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Vehicle);
      cb(vehicles);
    },
    (error) => {
      console.error("[subscribeAllVehicles] failed:", error);
      cb([]);
    },
  );
}

/** Upsert a vehicle doc. */
export async function saveVehicle(
  vehicle: Vehicle,
  actorOverride?: { name: string; uid: string; role: string },
): Promise<void> {
  const { id, ...data } = vehicle;
  const now = new Date().toISOString();
  const docRef = doc(db, VEHICLES_COL, id);

  const existingSnap = await getDoc(docRef);
  const existing = existingSnap.exists() ? (existingSnap.data() as Vehicle) : null;
  const isNew = !existing;

  const cleanData = removeUndefined({
    ...data,
    updatedAt: now,
    createdAt: data.createdAt || now,
  });
  await setDoc(docRef, cleanData, { merge: true });

  if (isNew) {
    await logActivity(
      vehicle.clientId,
      "Vehicle Added",
      "vehicleNumber",
      null,
      vehicle.vehicleNumber,
      actorOverride,
    );
  } else if (existing) {
    const fieldsToTrack: (keyof Vehicle)[] = [
      "vehicleNumber",
      "vehicleType",
      "chassisNumber",
      "engineNumber",
      "registrationDate",
      "status",
    ];
    for (const f of fieldsToTrack) {
      const oldVal = existing[f] || "";
      const newVal = vehicle[f] || "";
      if (oldVal !== newVal) {
        await logActivity(
          vehicle.clientId,
          "Vehicle Updated",
          f,
          String(oldVal),
          String(newVal),
          actorOverride,
        );
      }
    }
  }
}

/** Delete a vehicle doc. */
export async function deleteVehicle(id: string): Promise<void> {
  await deleteDoc(doc(db, VEHICLES_COL, id));
}

// ─── Service Operations ───────────────────────────────────────────────────────

/** Subscribe to services for a specific vehicle. */
export function subscribeToServicesForVehicle(
  vehicleId: string,
  cb: (services: Service[]) => void,
): () => void {
  const q = query(collection(db, SERVICES_COL), where("vehicleId", "==", vehicleId));
  return onSnapshot(
    q,
    (snap) => {
      const services = snap.docs.map((d) => {
        const item = d.data();
        const serviceAmount = item.serviceAmount ?? 0;
        const amountReceived = item.amountReceived ?? 0;
        return {
          id: d.id,
          ...item,
          pendingAmount: Math.max(0, serviceAmount - amountReceived),
        } as Service;
      });
      cb(services);
    },
    (error) => {
      console.error(`[subscribeToServicesForVehicle] vehicle=${vehicleId} failed:`, error);
      cb([]);
    },
  );
}

/** Subscribe to all services. */
export function subscribeAllServices(cb: (services: Service[]) => void): () => void {
  const q = query(collection(db, SERVICES_COL));
  return onSnapshot(
    q,
    (snap) => {
      const services = snap.docs.map((d) => {
        const item = d.data();
        const serviceAmount = item.serviceAmount ?? 0;
        const amountReceived = item.amountReceived ?? 0;
        return {
          id: d.id,
          ...item,
          pendingAmount: Math.max(0, serviceAmount - amountReceived),
        } as Service;
      });
      cb(services);
    },
    (error) => {
      console.error("[subscribeAllServices] failed:", error);
      cb([]);
    },
  );
}

/** Subscribe to services filtered by type. */
export function subscribeToServicesByType(
  serviceType: ServiceType,
  cb: (services: Service[]) => void,
): () => void {
  const q = query(collection(db, SERVICES_COL), where("serviceType", "==", serviceType));
  return onSnapshot(
    q,
    (snap) => {
      const services = snap.docs.map((d) => {
        const item = d.data();
        const serviceAmount = item.serviceAmount ?? 0;
        const amountReceived = item.amountReceived ?? 0;
        return {
          id: d.id,
          ...item,
          pendingAmount: Math.max(0, serviceAmount - amountReceived),
        } as Service;
      });
      cb(services);
    },
    (error) => {
      console.error(`[subscribeToServicesByType] type=${serviceType} failed:`, error);
      cb([]);
    },
  );
}

/** Upsert a service doc. */
export async function saveService(
  service: Service,
  actorOverride?: { name: string; uid: string; role: string },
): Promise<void> {
  const { id, ...data } = service;
  const now = new Date().toISOString();
  const docRef = doc(db, SERVICES_COL, id);
  const serviceAmount = data.serviceAmount ?? 0;
  const amountReceived = data.amountReceived ?? 0;
  const pendingAmount = Math.max(0, serviceAmount - amountReceived);
  const progress = getProgressFromStatus(data.taskStatus);

  const existingSnap = await getDoc(docRef);
  const existing = existingSnap.exists() ? (existingSnap.data() as Service) : null;
  const isNew = !existing;

  const cleanData = removeUndefined({
    ...data,
    pendingAmount,
    progress,
    updatedAt: now,
    createdAt: data.createdAt || now,
  });
  await setDoc(docRef, cleanData, { merge: true });

  // Look up vehicle to find its clientId for activity logging
  let clientId = "";
  try {
    const vDoc = await getDoc(doc(db, VEHICLES_COL, data.vehicleId));
    if (vDoc.exists()) {
      clientId = vDoc.data().clientId || "";
    }
  } catch (err) {
    console.error("Failed to fetch vehicle for service activity log:", err);
  }

  if (clientId) {
    if (isNew) {
      await logActivity(
        clientId,
        "Service Added",
        "serviceType",
        null,
        data.serviceType,
        actorOverride,
      );
    } else if (existing) {
      if (existing.dueDate !== data.dueDate) {
        await logActivity(
          clientId,
          "Due Date Changed",
          `${data.serviceType} Due Date`,
          existing.dueDate,
          data.dueDate,
          actorOverride,
        );
      }
      if (existing.serviceAmount !== serviceAmount || existing.amountReceived !== amountReceived) {
        await logActivity(
          clientId,
          "Accounting Updated",
          `${data.serviceType} Accounting`,
          `Amount: ${existing.serviceAmount}, Received: ${existing.amountReceived}`,
          `Amount: ${serviceAmount}, Received: ${amountReceived}`,
          actorOverride,
        );
      }
      if (existing.taskStatus !== data.taskStatus) {
        await logActivity(
          clientId,
          "Service Updated",
          `${data.serviceType} Status`,
          existing.taskStatus,
          data.taskStatus,
          actorOverride,
        );
      }
    }
  }
}

/** Delete a service doc. */
export async function deleteService(
  id: string,
  actorOverride?: { name: string; uid: string; role: string },
): Promise<void> {
  const sSnap = await getDoc(doc(db, SERVICES_COL, id));
  if (sSnap.exists()) {
    const service = sSnap.data() as Service;
    let clientId = "";
    try {
      const vDoc = await getDoc(doc(db, VEHICLES_COL, service.vehicleId));
      if (vDoc.exists()) {
        clientId = vDoc.data().clientId || "";
      }
    } catch (err) {
      console.error(err);
    }
    if (clientId) {
      await logActivity(
        clientId,
        "Service Removed",
        "serviceType",
        service.serviceType,
        null,
        actorOverride,
      );
    }
  }
  await deleteDoc(doc(db, SERVICES_COL, id));
}

// ─── Hierarchical Client Details ──────────────────────────────────────────────

/**
 * Subscribes to a client, all their vehicles, and all their services.
 * Dynamically aggregates accounting totals and yields details.
 */
export function subscribeToClientDetails(
  clientId: string,
  cb: (details: ClientDetails | null) => void,
): () => void {
  let client: Client | null = null;
  let vehicles: Vehicle[] = [];
  let serviceSubscribers: Record<string, () => void> = {};
  let servicesMap: Record<string, Service[]> = {};
  let unsubscribing = false;

  const triggerCallback = () => {
    if (unsubscribing || !client) {
      cb(null);
      return;
    }

    const detailedVehicles = vehicles.map((v) => ({
      ...v,
      services: servicesMap[v.id] ?? [],
    }));

    // Calculate aggregated accounting
    let totalAmount = 0;
    let amountReceived = 0;
    for (const v of detailedVehicles) {
      for (const s of v.services) {
        totalAmount += s.serviceAmount ?? 0;
        amountReceived += s.amountReceived ?? 0;
      }
    }

    const accounting: ClientAccounting = {
      totalAmount,
      amountReceived,
      pendingAmount: Math.max(0, totalAmount - amountReceived),
    };

    cb({
      ...client,
      vehicles: detailedVehicles,
      accounting,
    });
  };

  // Subscribe to Client
  const unsubClient = onSnapshot(doc(db, CLIENTS_COL, clientId), (snap) => {
    if (!snap.exists()) {
      client = null;
      triggerCallback();
      return;
    }
    client = { id: snap.id, ...snap.data() } as Client;
    triggerCallback();
  });

  // Subscribe to Vehicles
  const qVehicles = query(collection(db, VEHICLES_COL), where("clientId", "==", clientId));
  const unsubVehicles = onSnapshot(qVehicles, (snap) => {
    vehicles = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Vehicle);

    // Cleanup service subscriptions for vehicles that are no longer present
    const vehicleIds = vehicles.map((v) => v.id);
    Object.keys(serviceSubscribers).forEach((vid) => {
      if (!vehicleIds.includes(vid)) {
        serviceSubscribers[vid]();
        delete serviceSubscribers[vid];
        delete servicesMap[vid];
      }
    });

    // Subscribe to services for any new vehicles
    vehicles.forEach((v) => {
      if (!serviceSubscribers[v.id]) {
        const qServices = query(collection(db, SERVICES_COL), where("vehicleId", "==", v.id));
        serviceSubscribers[v.id] = onSnapshot(qServices, (sSnap) => {
          servicesMap[v.id] = sSnap.docs.map((d) => {
            const data = d.data();
            const serviceAmount = data.serviceAmount ?? 0;
            const amountReceived = data.amountReceived ?? 0;
            return {
              id: d.id,
              ...data,
              pendingAmount: Math.max(0, serviceAmount - amountReceived),
            } as Service;
          });
          triggerCallback();
        });
      }
    });

    triggerCallback();
  });

  return () => {
    unsubscribing = true;
    unsubClient();
    unsubVehicles();
    Object.values(serviceSubscribers).forEach((unsub) => unsub());
  };
}

/** Add a document metadata object to a vehicle's documents array. */
export async function addVehicleDocument(
  vehicleId: string,
  docData: VehicleDocument,
  actorOverride?: { name: string; uid: string; role: string },
): Promise<void> {
  const docRef = doc(db, VEHICLES_COL, vehicleId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Vehicle not found");
  const vehicle = snap.data() as Vehicle;
  const documents = vehicle.documents || [];
  documents.push(docData);
  await setDoc(docRef, { documents }, { merge: true });

  await logActivity(
    vehicle.clientId,
    "Document Uploaded",
    "documentName",
    null,
    docData.fileName,
    actorOverride,
  );
}

/** Delete a document metadata object from a vehicle's documents array by document id. */
export async function deleteVehicleDocument(
  vehicleId: string,
  documentId: string,
  actorOverride?: { name: string; uid: string; role: string },
): Promise<void> {
  const docRef = doc(db, VEHICLES_COL, vehicleId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Vehicle not found");
  const vehicle = snap.data() as Vehicle;
  const toDelete = (vehicle.documents || []).find((d) => d.id === documentId);
  const documents = (vehicle.documents || []).filter((d) => d.id !== documentId);
  await setDoc(docRef, { documents }, { merge: true });

  if (toDelete) {
    await logActivity(
      vehicle.clientId,
      "Document Removed",
      "documentName",
      toDelete.fileName,
      null,
      actorOverride,
    );
  }
}
