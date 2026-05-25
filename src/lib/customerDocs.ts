// Per-customer document store backed by localStorage.
export interface CustomerDoc {
  id: string;
  customerId: string;
  name: string;
  type: string;
  addedAt: string;
}

const KEY = "registry-customer-docs";

function loadAll(): CustomerDoc[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function saveAll(docs: CustomerDoc[]) {
  localStorage.setItem(KEY, JSON.stringify(docs));
}

export function loadDocsFor(customerId: string): CustomerDoc[] {
  return loadAll().filter((d) => d.customerId === customerId);
}

export function addDoc(customerId: string, name: string, type: string): CustomerDoc {
  const doc: CustomerDoc = {
    id: crypto.randomUUID(),
    customerId,
    name,
    type,
    addedAt: new Date().toISOString(),
  };
  saveAll([doc, ...loadAll()]);
  return doc;
}

export function deleteDoc(docId: string) {
  saveAll(loadAll().filter((d) => d.id !== docId));
}
