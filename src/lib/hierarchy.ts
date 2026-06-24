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
} from "firebase/firestore";
import { db } from "./firebase";
import { removeUndefined, type ServiceType } from "./records";

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
  "Verification": 40,
  "Submitted": 60,
  "Approved": 80,
  "Completed": 100,
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
  errorCb?: (error: unknown) => void
): () => void {
  const q = query(collection(db, CLIENTS_COL), where("type", "==", type));
  return onSnapshot(
    q,
    (snap) => {
      const clients = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Client));
      cb(clients.sort((a, b) => a.name.localeCompare(b.name)));
    },
    (error) => {
      console.error(`[subscribeToClients] type=${type} failed:`, error);
      if (errorCb) errorCb(error);
      cb([]);
    }
  );
}

/** Subscribe to all clients. */
export function subscribeAllClients(
  cb: (clients: Client[]) => void,
  errorCb?: (error: unknown) => void
): () => void {
  const q = query(collection(db, CLIENTS_COL));
  return onSnapshot(
    q,
    (snap) => {
      const clients = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Client));
      cb(clients.sort((a, b) => a.name.localeCompare(b.name)));
    },
    (error) => {
      console.error("[subscribeAllClients] failed:", error);
      if (errorCb) errorCb(error);
      cb([]);
    }
  );
}

/** Upsert a client doc. */
export async function saveClient(client: Client): Promise<void> {
  const { id, ...data } = client;
  const now = new Date().toISOString();
  const docRef = doc(db, CLIENTS_COL, id);
  const cleanData = removeUndefined({
    ...data,
    updatedAt: now,
    createdAt: data.createdAt || now,
  });
  await setDoc(docRef, cleanData, { merge: true });
}

/** Delete a client doc. */
export async function deleteClient(id: string): Promise<void> {
  // To avoid orphaned vehicles, we should delete vehicles under this client,
  // but following rules we will also implement cascade logic if appropriate,
  // or just delete the client.
  await deleteDoc(doc(db, CLIENTS_COL, id));
}

// ─── Vehicle Operations ───────────────────────────────────────────────────────

/** Subscribe to vehicles for a specific client. */
export function subscribeToVehiclesForClient(
  clientId: string,
  cb: (vehicles: Vehicle[]) => void
): () => void {
  const q = query(collection(db, VEHICLES_COL), where("clientId", "==", clientId));
  return onSnapshot(
    q,
    (snap) => {
      const vehicles = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Vehicle));
      cb(vehicles.sort((a, b) => a.vehicleNumber.localeCompare(b.vehicleNumber)));
    },
    (error) => {
      console.error(`[subscribeToVehiclesForClient] client=${clientId} failed:`, error);
      cb([]);
    }
  );
}

/** Subscribe to all vehicles. */
export function subscribeAllVehicles(cb: (vehicles: Vehicle[]) => void): () => void {
  const q = query(collection(db, VEHICLES_COL));
  return onSnapshot(
    q,
    (snap) => {
      const vehicles = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Vehicle));
      cb(vehicles);
    },
    (error) => {
      console.error("[subscribeAllVehicles] failed:", error);
      cb([]);
    }
  );
}

/** Upsert a vehicle doc. */
export async function saveVehicle(vehicle: Vehicle): Promise<void> {
  const { id, ...data } = vehicle;
  const now = new Date().toISOString();
  const docRef = doc(db, VEHICLES_COL, id);
  const cleanData = removeUndefined({
    ...data,
    updatedAt: now,
    createdAt: data.createdAt || now,
  });
  await setDoc(docRef, cleanData, { merge: true });
}

/** Delete a vehicle doc. */
export async function deleteVehicle(id: string): Promise<void> {
  await deleteDoc(doc(db, VEHICLES_COL, id));
}

// ─── Service Operations ───────────────────────────────────────────────────────

/** Subscribe to services for a specific vehicle. */
export function subscribeToServicesForVehicle(
  vehicleId: string,
  cb: (services: Service[]) => void
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
    }
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
    }
  );
}

/** Subscribe to services filtered by type. */
export function subscribeToServicesByType(
  serviceType: ServiceType,
  cb: (services: Service[]) => void
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
    }
  );
}

/** Upsert a service doc. */
export async function saveService(service: Service): Promise<void> {
  const { id, ...data } = service;
  const now = new Date().toISOString();
  const docRef = doc(db, SERVICES_COL, id);
  const serviceAmount = data.serviceAmount ?? 0;
  const amountReceived = data.amountReceived ?? 0;
  const pendingAmount = Math.max(0, serviceAmount - amountReceived);
  const progress = getProgressFromStatus(data.taskStatus);

  const cleanData = removeUndefined({
    ...data,
    pendingAmount,
    progress,
    updatedAt: now,
    createdAt: data.createdAt || now,
  });
  await setDoc(docRef, cleanData, { merge: true });
}

/** Delete a service doc. */
export async function deleteService(id: string): Promise<void> {
  await deleteDoc(doc(db, SERVICES_COL, id));
}

// ─── Hierarchical Client Details ──────────────────────────────────────────────

/**
 * Subscribes to a client, all their vehicles, and all their services.
 * Dynamically aggregates accounting totals and yields details.
 */
export function subscribeToClientDetails(
  clientId: string,
  cb: (details: ClientDetails | null) => void
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
    vehicles = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Vehicle));

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
