# Service Management System - Quick Start Guide

## For Users

### Creating a New Service Client

1. **Navigate to Clients page**: `/dashboard/clients`
2. **Click "Add" button** in the top right
3. **Fill in client details**:
   - SR NO, Date, MV NO, Application, Work, Name
   - Group Name (optional)
   - Status, Mobile, Insurance, Fitness, Tax, C/O
4. **NEW: Select Service Type** (Required)
   - Click the "Service Type" dropdown
   - Choose from: Insurance, Fitness, Permit, Gujarat Permit, National Permit, Tax, PUC, License, RC Transfer, HP Addition, HP Termination
   - Cannot manually type - must select from list
5. **NEW: Set Service Due Date** (Optional)
   - Click the date picker
   - Select renewal date for tracking
6. **Add Accounting Details**:
   - Total Service Amount
   - Amount Received
   - Payment Date
7. **Assign to Staff** (if admin)
8. **Save** the record

### Viewing Service Dashboard

**Option 1: From Main Dashboard**
1. Go to `/dashboard` (home)
2. Scroll to "Service Management" section
3. Click any service name in "Revenue by Service" card
4. OR click a service button in "Quick Access Services" grid

**Option 2: Direct URL**
- Visit `/dashboard/service/Insurance`
- Visit `/dashboard/service/Fitness`
- Replace `Insurance` with any service type

**Option 3: From Clients List**
- Find a client with a service type
- Click client details to see service information

### What You'll See in Service Dashboard

- **Statistics Cards**: Total Clients, Active Cases, Completed, Pending
- **Revenue Cards**: 
  - Total Revenue (sum of all service amounts)
  - Amount Received (total payments collected)
  - Pending Amount (outstanding balance)
- **Client Table**: All clients for that service with:
  - Serial Number, Name, Vehicle Number
  - Status, Service Due Date
  - Service Amount, Amount Received, Pending Amount
- **Links**: Back to all clients with arrow button

### Tracking Renewals

**View Upcoming Renewals**
1. Go to Main Dashboard `/dashboard`
2. Look for "Upcoming Renewals (30 Days)" card
3. Shows all services due for renewal within next 30 days
4. Displays: Client Name, Service Type, Due Date

**Set Renewal Dates**
1. Edit a client record (click pencil icon)
2. Scroll to "Service Management" section
3. Fill in "Service Due Date"
4. Save the record

**System automatically**:
- Tracks all due dates
- Shows upcoming renewals on dashboard
- Allows filtering by service type

---

## For Developers

### Adding Service Data Programmatically

```typescript
import { saveRecord } from "@/lib/records";

const newClient = {
  id: "doc-id",
  srNo: 100,
  date: "2024-01-15",
  mvNo: "GJ-05-AB-1234",
  application: "New Registration",
  work: "Insurance",
  name: "Rajesh Kumar",
  status: "In Progress" as const,
  mo: "9876543210",
  insurance: "Valid",
  fitness: "Valid",
  tax: "Paid",
  co: "Mr. Sharma",
  serviceType: "Insurance" as const,          // NEW
  serviceDueDate: "2025-01-15",               // NEW
  serviceAmount: 5000,
  amountReceived: 3000,
};

await saveRecord("clients", newClient, "system");
```

### Querying Service Data

```typescript
import {
  getServiceClients,
  getServiceStats,
  getServiceRevenue,
  getUpcomingRenewals,
} from "@/lib/services";

// Get all Insurance clients
const insuranceClients = await getServiceClients("clients", "Insurance");

// Get Insurance statistics
const stats = await getServiceStats("Insurance");
console.log(`Insurance: ${stats.active} active, ${stats.completed} completed`);

// Get Insurance revenue
const revenue = await getServiceRevenue("Insurance");
console.log(`Insurance Revenue: ₹${revenue.toLocaleString("en-IN")}`);

// Get services renewing soon
const renewals = await getUpcomingRenewals(30); // Next 30 days
renewals.forEach(r => {
  console.log(`${r.name} - ${r.serviceType} due ${r.serviceDueDate}`);
});
```

### Working with Service Types

```typescript
import { SERVICE_TYPES, serviceLabel, serviceColor } from "@/lib/records";

// List all services
SERVICE_TYPES.forEach(service => {
  console.log(serviceLabel(service)); // 🛡️ Insurance, 💪 Fitness, etc.
  console.log(serviceColor(service));  // bg-blue-500, bg-green-500, etc.
});

// Check if type is valid
const isValid = SERVICE_TYPES.includes("Insurance"); // true
const notValid = SERVICE_TYPES.includes("Unknown");  // false
```

### Service Dashboard Component

```typescript
import { ServiceDashboard } from "@/components/ServiceDashboard";

// Use in any component
function MyComponent() {
  return <ServiceDashboard serviceType="Insurance" />;
}
```

### Real-time Service Client Updates

```typescript
import { subscribeToRecords } from "@/lib/records";

// Subscribe to clients and filter by service type
function MyComponent() {
  const [clients, setClients] = useState<RegistryRecord[]>([]);

  useEffect(() => {
    const unsub = subscribeToRecords("clients", (allClients) => {
      const insuranceOnly = allClients.filter(
        c => c.serviceType === "Insurance"
      );
      setClients(insuranceOnly);
    });

    return unsub;
  }, []);

  return (
    <ul>
      {clients.map(c => (
        <li key={c.id}>{c.name} - {c.serviceAmount}</li>
      ))}
    </ul>
  );
}
```

---

## Service Types Reference

| Service Type | Emoji | Color | Use Case |
|---|---|---|---|
| Insurance | 🛡️ | Blue | Vehicle insurance policies |
| Fitness | 💪 | Green | Vehicle fitness certificates |
| Permit | 📜 | Purple | Vehicle permits |
| Gujarat Permit | 📍 | Purple-600 | Gujarat-specific permits |
| National Permit | 🇮🇳 | Purple-700 | National-level permits |
| Tax | 💰 | Yellow | Tax-related services |
| PUC | 🌍 | Emerald | Pollution Under Control |
| License | 🔖 | Cyan | License applications |
| RC Transfer | 🔄 | Orange | Registration transfer |
| HP Addition | ➕ | Pink | Hire Purchase additions |
| HP Termination | ❌ | Red | Hire Purchase endings |

---

## Firestore Data Structure

### Client Record with Service Fields

```json
{
  "id": "doc-id",
  "srNo": 100,
  "date": "2024-01-15",
  "mvNo": "GJ-05-AB-1234",
  "name": "Rajesh Kumar",
  "status": "In Progress",
  "serviceType": "Insurance",
  "serviceStatus": "In Progress",
  "serviceDueDate": "2025-01-15",
  "serviceAmount": 5000,
  "amountReceived": 3000,
  "paymentStatus": "Partially Paid",
  "activityLogs": [...]
}
```

---

## Common Tasks

### Add Service to Existing Client
1. Find the client record
2. Click edit (pencil icon)
3. Scroll to Service Management section
4. Select service type from dropdown
5. Optionally set due date
6. Save

### Change Service Type
1. Edit client
2. Change the service type dropdown
3. Saves to Firestore automatically
4. Appears in new service dashboard immediately

### View All Insurance Clients
1. Go to `/dashboard/service/Insurance`
2. All clients with "Insurance" service type appear
3. Sorted by SR NO
4. Shows revenue and payment status

### Check Revenue by Service
1. Go to Main Dashboard
2. "Revenue by Service" section shows breakdown
3. Click service name to go to that service dashboard
4. See detailed revenue metrics

### Set Renewal Reminder
1. Edit client record
2. Set "Service Due Date"
3. It appears in "Upcoming Renewals" table
4. Shows when due within 30 days

---

## Troubleshooting

### Service Type Not Showing in Dropdown
- Only 11 predefined service types are available
- See "Service Types Reference" table above
- Check spelling in code if adding new type

### Service Dashboard Shows No Data
- Ensure client has `serviceType` field set
- Check that service type matches the route parameter
- Verify Firestore documents include `serviceType` field

### Revenue Not Calculating
- Check that `serviceAmount` is set on client records
- Verify numbers are stored as numeric type (not strings)
- In Firestore console, confirm field type is Number

### Renewal Not Showing
- Set `serviceDueDate` on client record
- Date must be within next 30 days
- Check date format is ISO string (YYYY-MM-DD)

---

## Browser Navigation

| Page | URL | Purpose |
|---|---|---|
| Main Dashboard | `/dashboard` | Overview with service summary |
| Clients List | `/dashboard/clients` | All clients, add/edit clients |
| Insurance Dashboard | `/dashboard/service/Insurance` | Insurance-specific view |
| Fitness Dashboard | `/dashboard/service/Fitness` | Fitness-specific view |
| Any Service | `/dashboard/service/{ServiceType}` | Dynamic service dashboard |

---

## Keyboard Shortcuts

- **E** - Edit selected record
- **D** - Delete selected record
- **A** - Add new record
- **S** - Search/focus search box
- **Tab** - Navigate form fields
- **Enter** - Submit form / Select from dropdown

---

Last Updated: 2024
Status: Complete and Production Ready
