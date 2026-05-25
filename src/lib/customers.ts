// Customer profiles with vehicle records for the Customers page.
import type { RecordStatus } from "./records";

export interface VehicleRecord {
  id: string;
  mvNo: string;
  work: string;
  insurance: string;
  fitness: string;
  tax: string;
  status: RecordStatus;
}

export interface CustomerProfile {
  id: string;
  name: string;
  address: string;
  mobile: string;
  email: string;
  vehicles: VehicleRecord[];
}

const KEY = "registry-customer-profiles";

const SEED: CustomerProfile[] = [
  {
    id: "cu1",
    name: "Rajesh Sharma",
    address: "100 FC Road, Pune",
    mobile: "+91 9000000000",
    email: "rajesh.sharma@mail.com",
    vehicles: [
      { id: "v1a", mvNo: "MH-09-BH-0137", work: "Insurance Renewal", insurance: "2027-06-01", fitness: "2027-05-10", tax: "Paid", status: "Completed" },
    ],
  },
  {
    id: "cu2",
    name: "Vikram Malhotra",
    address: "101 JM Road, Pune",
    mobile: "+91 9000004231",
    email: "vikram.malhotra@mail.com",
    vehicles: [
      { id: "v2a", mvNo: "MH-43-CQ-0274", work: "Fitness Renewal", insurance: "2027-03-15", fitness: "2027-02-28", tax: "Paid", status: "In Progress" },
      { id: "v2b", mvNo: "MH-43-CQ-0911", work: "Tax Payment", insurance: "2026-11-20", fitness: "2026-10-05", tax: "Due", status: "Pending" },
    ],
  },
  {
    id: "cu3",
    name: "Anita Desai",
    address: "102 MG Road, Pune",
    mobile: "+91 9000008462",
    email: "anita.desai@mail.com",
    vehicles: [
      { id: "v3a", mvNo: "MH-09-DX-0411", work: "Ownership Transfer", insurance: "2026-08-30", fitness: "2026-09-15", tax: "Paid", status: "In Progress" },
      { id: "v3b", mvNo: "MH-09-DX-1055", work: "Commercial Permit", insurance: "2027-01-10", fitness: "2027-01-20", tax: "Paid", status: "Pending" },
      { id: "v3c", mvNo: "MH-09-DX-2200", work: "Insurance Renewal", insurance: "2026-12-05", fitness: "2026-11-30", tax: "Due", status: "On Hold" },
    ],
  },
  {
    id: "cu4",
    name: "Rohan Gupta",
    address: "103 JM Road, Pune",
    mobile: "+91 9000012693",
    email: "rohan.gupta@mail.com",
    vehicles: [
      { id: "v4a", mvNo: "MH-12-EE-0548", work: "Fitness + Insurance", insurance: "2027-04-22", fitness: "2027-03-18", tax: "Paid", status: "Completed" },
    ],
  },
  {
    id: "cu5",
    name: "Sneha Mishra",
    address: "104 Aundh, Pune",
    mobile: "+91 9000016924",
    email: "sneha.mishra@mail.com",
    vehicles: [
      { id: "v5a", mvNo: "MH-12-FM-0685", work: "New Registration", insurance: "2027-07-11", fitness: "2027-06-30", tax: "Paid", status: "Pending" },
      { id: "v5b", mvNo: "MH-12-FM-1100", work: "Tax Payment", insurance: "2026-10-01", fitness: "2026-09-25", tax: "Due", status: "In Progress" },
    ],
  },
  {
    id: "cu6",
    name: "Arjun Nair",
    address: "105 Kothrud, Pune",
    mobile: "+91 9000021155",
    email: "arjun.nair@mail.com",
    vehicles: [
      { id: "v6a", mvNo: "MH-14-GN-0732", work: "Insurance Renewal", insurance: "2027-02-14", fitness: "2027-01-31", tax: "Paid", status: "Completed" },
    ],
  },
  {
    id: "cu7",
    name: "Pooja Rao",
    address: "106 Deccan, Pune",
    mobile: "+91 9000025386",
    email: "pooja.rao@mail.com",
    vehicles: [
      { id: "v7a", mvNo: "MH-15-HR-0819", work: "Fitness Renewal", insurance: "2026-07-20", fitness: "2026-08-10", tax: "Paid", status: "In Progress" },
      { id: "v7b", mvNo: "MH-15-HR-1403", work: "Permit Renewal", insurance: "2027-05-05", fitness: "2027-04-25", tax: "Paid", status: "Pending" },
    ],
  },
  {
    id: "cu8",
    name: "Suresh Pawar",
    address: "107 Hadapsar, Pune",
    mobile: "+91 9000029617",
    email: "suresh.pawar@mail.com",
    vehicles: [
      { id: "v8a", mvNo: "MH-20-JK-0956", work: "Ownership Transfer", insurance: "2026-09-18", fitness: "2026-10-30", tax: "Due", status: "On Hold" },
    ],
  },
  {
    id: "cu9",
    name: "Meena Kulkarni",
    address: "108 Viman Nagar, Pune",
    mobile: "+91 9000033848",
    email: "meena.kulkarni@mail.com",
    vehicles: [
      { id: "v9a", mvNo: "MH-14-LM-1043", work: "Insurance + Tax", insurance: "2027-08-01", fitness: "2027-07-15", tax: "Paid", status: "Completed" },
      { id: "v9b", mvNo: "MH-14-LM-1890", work: "New Registration", insurance: "2027-09-20", fitness: "2027-08-31", tax: "Paid", status: "Pending" },
    ],
  },
  {
    id: "cu10",
    name: "Deepak Joshi",
    address: "109 Baner, Pune",
    mobile: "+91 9000038079",
    email: "deepak.joshi@mail.com",
    vehicles: [
      { id: "v10a", mvNo: "MH-11-NP-1130", work: "Fitness Renewal", insurance: "2026-11-05", fitness: "2026-12-20", tax: "Paid", status: "In Progress" },
    ],
  },
  {
    id: "cu11",
    name: "Kavita Singh",
    address: "110 Wakad, Pune",
    mobile: "+91 9000042210",
    email: "kavita.singh@mail.com",
    vehicles: [
      { id: "v11a", mvNo: "MH-12-QR-1217", work: "Permit + Insurance", insurance: "2027-03-28", fitness: "2027-02-14", tax: "Paid", status: "Completed" },
      { id: "v11b", mvNo: "MH-12-QR-2001", work: "Tax Payment", insurance: "2026-06-15", fitness: "2026-07-01", tax: "Due", status: "Pending" },
      { id: "v11c", mvNo: "MH-12-QR-3310", work: "Fitness Renewal", insurance: "2027-10-12", fitness: "2027-09-30", tax: "Paid", status: "In Progress" },
    ],
  },
  {
    id: "cu12",
    name: "Anil Deshmukh",
    address: "111 Katraj, Pune",
    mobile: "+91 9000046441",
    email: "anil.deshmukh@mail.com",
    vehicles: [
      { id: "v12a", mvNo: "MH-14-ST-1304", work: "Ownership Transfer", insurance: "2026-12-08", fitness: "2026-11-22", tax: "Paid", status: "In Progress" },
    ],
  },
  {
    id: "cu13",
    name: "Rekha Patil",
    address: "112 Pimpri, Pune",
    mobile: "+91 9000050672",
    email: "rekha.patil@mail.com",
    vehicles: [
      { id: "v13a", mvNo: "MH-12-UV-1391", work: "Insurance Renewal", insurance: "2027-01-25", fitness: "2027-01-10", tax: "Paid", status: "Completed" },
      { id: "v13b", mvNo: "MH-12-UV-2750", work: "Fitness Check", insurance: "2026-08-14", fitness: "2026-09-03", tax: "Due", status: "On Hold" },
    ],
  },
  {
    id: "cu14",
    name: "Sanjay Bhosale",
    address: "113 Chinchwad, Pune",
    mobile: "+91 9000054903",
    email: "sanjay.bhosale@mail.com",
    vehicles: [
      { id: "v14a", mvNo: "MH-14-WX-1478", work: "New Registration", insurance: "2027-06-18", fitness: "2027-05-27", tax: "Paid", status: "Pending" },
    ],
  },
  {
    id: "cu15",
    name: "Lata Iyer",
    address: "114 Shivajinagar, Pune",
    mobile: "+91 9000059134",
    email: "lata.iyer@mail.com",
    vehicles: [
      { id: "v15a", mvNo: "MH-09-YZ-1565", work: "Tax + Insurance", insurance: "2027-04-07", fitness: "2027-03-22", tax: "Paid", status: "Completed" },
      { id: "v15b", mvNo: "MH-09-YZ-2604", work: "Permit Renewal", insurance: "2026-10-29", fitness: "2026-11-14", tax: "Paid", status: "In Progress" },
    ],
  },
];

export function loadCustomers(): CustomerProfile[] {
  if (typeof window === "undefined") return SEED;
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    localStorage.setItem(KEY, JSON.stringify(SEED));
    return SEED;
  }
  try {
    return JSON.parse(raw) as CustomerProfile[];
  } catch {
    return SEED;
  }
}

export function saveCustomers(profiles: CustomerProfile[]) {
  localStorage.setItem(KEY, JSON.stringify(profiles));
  window.dispatchEvent(new Event("customers-change"));
}
