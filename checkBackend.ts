// Firestore backend connectivity check
import { db } from "./src/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

async function checkBackend() {
  try {
    const colRef = collection(db, "registry_clients_v2");
    const snapshot = await getDocs(colRef);
    console.log("✅ Backend reachable. Document count:", snapshot.size);
  } catch (err) {
    console.error("❌ Backend connection error:", err);
  }
}

checkBackend();
