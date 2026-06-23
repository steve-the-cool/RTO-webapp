# Service-Wise Accounting - Quick Reference Guide

## 📊 Data Structure

### Old System (Removed ❌)
```typescript
// Client Record Level (NO LONGER USED)
{
  id: "client-123",
  name: "John Doe",
  serviceAmount: 15000,      // ❌ REMOVED
  amountReceived: 5000,       // ❌ REMOVED
  paymentStatus: "Partially Paid",  // ❌ REMOVED
  paymentDate: "2024-01-15",  // ❌ REMOVED
  pendingAmount: 10000,       // ❌ REMOVED
  services: [...]
}
```

### New System (Current ✅)
```typescript
// Services Array (SINGLE SOURCE OF TRUTH)
{
  id: "client-123",
  name: "John Doe",
  services: [
    {
      serviceType: "Insurance",
      dueDate: "2024-02-15",
      price: 5000,              // ✅ Service amount
      amountReceived: 2000,     // ✅ Amount received for THIS service
      status: "Active",
      assignee: "emp-001",
      // Pending is auto-calculated: 5000 - 2000 = 3000
      // Payment Status: "Partially Paid" (since 0 < 2000 < 5000)
    },
    {
      serviceType: "License New",
      dueDate: "2024-03-20",
      price: 10000,
      amountReceived: 3000,
      status: "Active",
      assignee: "emp-002",
      // Pending: 10000 - 3000 = 7000
      // Payment Status: "Partially Paid"
    },
    // Record totals:
    // Total Price: 15000
    // Total Received: 5000
    // Total Pending: 10000
    // Record Status: "Partially Paid" (5000 > 0 && 5000 < 15000)
  ]
}
```

---

## 🧮 Calculation Examples

### Pending Amount Calculation (Per Service)
```javascript
const service = {
  serviceType: "Insurance",
  price: 5000,
  amountReceived: 2000,
};

const pending = Math.max(0, (service.price || 0) - (service.amountReceived || 0));
// Result: 3000
```

### Payment Status Calculation (Per Service)
```javascript
function getServicePaymentStatus(service) {
  const received = service.amountReceived || 0;
  const amount = service.price || 0;
  
  if (received === 0) return "Unpaid";
  if (received >= amount) return "Paid";
  return "Partially Paid";  // 0 < received < amount
}

// Examples:
getServicePaymentStatus({ price: 5000, amountReceived: 0 });      // "Unpaid"
getServicePaymentStatus({ price: 5000, amountReceived: 2000 });   // "Partially Paid"
getServicePaymentStatus({ price: 5000, amountReceived: 5000 });   // "Paid"
```

### Record-Level Aggregation (From Services)
```javascript
function getRecordMetrics(record) {
  const services = record.services || [];
  
  const totalPrice = services.reduce(
    (sum, s) => sum + (s.price || 0), 
    0
  );
  
  const totalReceived = services.reduce(
    (sum, s) => sum + (s.amountReceived || 0), 
    0
  );
  
  const totalPending = Math.max(0, totalPrice - totalReceived);
  
  const paymentStatus = 
    totalReceived === 0 ? "Unpaid" :
    totalReceived >= totalPrice ? "Paid" :
    "Partially Paid";
  
  return { totalPrice, totalReceived, totalPending, paymentStatus };
}

// Example Usage:
const metrics = getRecordMetrics(record);
// {
//   totalPrice: 15000,
//   totalReceived: 5000,
//   totalPending: 10000,
//   paymentStatus: "Partially Paid"
// }
```

---

## 🎯 Common Operations

### Reading Service Accounting
```javascript
// Get service details with accounting info
const serviceDetails = getRecordServiceDetails(record);
// Returns array with all service info including amountReceived

serviceDetails.forEach(service => {
  console.log(`${service.serviceType}:`);
  console.log(`  Amount: ₹${service.price}`);
  console.log(`  Received: ₹${service.amountReceived ?? 0}`);
  console.log(`  Pending: ₹${(service.price ?? 0) - (service.amountReceived ?? 0)}`);
});
```

### Updating Service Amount Received
```javascript
// Update a specific service's amountReceived
const updatedRecord = {
  ...record,
  services: record.services.map(s =>
    s.serviceType === "Insurance"
      ? { ...s, amountReceived: 3000 }
      : s
  )
};

await saveRecord(bucket, updatedRecord, currentUser);
```

### Aggregating Across Multiple Records
```javascript
// Get total revenue across all clients
async function getTotalRevenue() {
  const records = await getAllRecords();
  return records.reduce((sum, record) => {
    const serviceTotal = (record.services || []).reduce(
      (sum, s) => sum + (s.price || 0),
      0
    );
    return sum + serviceTotal;
  }, 0);
}

// Get total collected
async function getTotalCollected() {
  const records = await getAllRecords();
  return records.reduce((sum, record) => {
    const serviceTotal = (record.services || []).reduce(
      (sum, s) => sum + (s.amountReceived || 0),
      0
    );
    return sum + serviceTotal;
  }, 0);
}
```

---

## 📱 UI Examples

### Service Row in Form (RecordTable)
```
┌─────────────────────────────────────────────────────────────────┐
│ Service: [Insurance ▼] Due: [2024-02-15] Amount: [5000]        │
│ Received: [2000] Pending: [3000] (disabled) Status: [Active ▼] │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Service: [License New ▼] Due: [2024-03-20] Amount: [10000]     │
│ Received: [3000] Pending: [7000] (disabled) Status: [Active ▼] │
└─────────────────────────────────────────────────────────────────┘
```

### Dashboard Card Example
```
┌──────────────────────────────────┐
│ Total Revenue                    │
│ ₹15,000                          │
│                                  │
│ Amount Collected: ₹5,000 (33%)   │
│ Pending: ₹10,000 (67%)           │
│                                  │
│ Payment Status: Partially Paid   │
└──────────────────────────────────┘
```

### Service Module Dashboard (Example)
```
Filter: Insurance services only

KPI Cards:
┌─────────────────────┬─────────────────────┬─────────────────────┐
│ Revenue (Insurance) │ Collected (Insur.)  │ Pending (Insurance) │
│ ₹45,000             │ ₹28,000 (62%)       │ ₹17,000 (38%)       │
└─────────────────────┴─────────────────────┴─────────────────────┘

Service-specific status:
- Paid: 3 services
- Partially Paid: 5 services
- Unpaid: 2 services
```

---

## 🔄 Migration Example

### Before Migration (Legacy Data)
```javascript
{
  id: "client-456",
  name: "ABC Corp",
  serviceAmount: 20000,
  amountReceived: 8000,
  paymentStatus: "Partially Paid",
  services: [
    { serviceType: "Insurance", dueDate: "2024-02-10", price: undefined },
    { serviceType: "Tax", dueDate: "2024-03-15", price: undefined },
  ]
}
```

### After Auto-Migration
```javascript
{
  id: "client-456",
  name: "ABC Corp",
  // Old fields removed ✅
  services: [
    {
      serviceType: "Insurance",
      dueDate: "2024-02-10",
      price: 10000,           // ✅ Distributed: 20000 / 2
      amountReceived: 4000,   // ✅ Distributed: 8000 / 2
    },
    {
      serviceType: "Tax",
      dueDate: "2024-03-15",
      price: 10000,           // ✅ Distributed: 20000 / 2
      amountReceived: 4000,   // ✅ Distributed: 8000 / 2
    },
  ]
}
```

---

## 📋 Helper Functions Reference

### In records.ts

```typescript
// Service-level helpers
getServicePaymentStatus(service: ServiceDetail): "Paid" | "Partially Paid" | "Unpaid"
getServicePendingAmount(service: ServiceDetail): number
calculateServicePaymentStatus(service: ServiceDetail): PaymentStatus
calculateServicePendingAmount(service: ServiceDetail): number

// Record-level aggregation
getRecordPaymentStatus(record: RegistryRecord): PaymentStatus  // Uses service data
getRecordTotalReceived(record: RegistryRecord): number
getRecordTotalPending(record: RegistryRecord): number
getRecordServiceDetails(record: RegistryRecord): ServiceDetail[]  // With amountReceived
getRecordServiceAmount(record: RegistryRecord): number
```

### In services.ts

```typescript
// Service type specific
getServiceRevenue(serviceType: ServiceType): Promise<number>  // Sums service.price
getServiceAmountReceived(serviceType: ServiceType): Promise<number>  // Sums service.amountReceived
getServicePendingAmount(serviceType: ServiceType): Promise<number>  // revenue - received

// Aggregate across all services
getTotalRevenue(): Promise<number>  // NEW: Sums all service.price
getTotalAmountReceived(): Promise<number>  // NEW: Sums all service.amountReceived
getTotalPendingAmount(): Promise<number>  // NEW: Calculates total pending
```

---

## ⚠️ Important Notes

### ✅ What to Do
- Always read amounts from service-level data
- Always aggregate from services array for dashboard totals
- Use helper functions for calculations
- Update amountReceived on individual services

### ❌ What NOT to Do
- Don't read from record.serviceAmount anymore
- Don't read from record.amountReceived anymore
- Don't use record.paymentStatus for accounting
- Don't calculate pending from record-level data

### 🔄 Migration Checklist
- [ ] Identify records with old accounting data
- [ ] Run admin migration tool to auto-distribute
- [ ] Verify service amounts are correct
- [ ] Test dashboards show correct aggregates
- [ ] Update any custom reports to use service-level data

---

## 📞 Quick Troubleshooting

### Issue: Dashboard shows $0
**Solution**: Check if services array is populated with `price` values

### Issue: Payment status incorrect
**Solution**: Verify `amountReceived` field exists on service and is less than `price`

### Issue: Pending amount wrong
**Solution**: Check calculation: pending = Math.max(0, price - amountReceived)

### Issue: Old accounting fields still present
**Solution**: Run migration tool to remove old fields

---

**Last Updated**: Now
**System**: Service-Wise Accounting v1.0
**Status**: ✅ Production Ready
