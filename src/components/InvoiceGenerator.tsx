// InvoiceGenerator Component - Create invoices from client services
import { useState, useEffect } from "react";
import { Search, Loader2, AlertCircle, CheckCircle2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribeToRecords, type RegistryRecord, type Bucket } from "@/lib/records";
import {
  createInvoice,
  validateBillingPeriodSequence,
  getLatestBillingPeriod,
  getNextBillingStartDate,
  type InvoiceServiceItem,
  type Invoice,
} from "@/lib/billing";
import { getSession } from "@/lib/auth";

interface InvoiceGeneratorProps {
  onInvoiceCreated?: (invoice: Invoice) => void;
}

export function InvoiceGenerator({ onInvoiceCreated }: InvoiceGeneratorProps) {
  const [clients, setClients] = useState<RegistryRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<RegistryRecord | null>(null);
  const [billingStartDate, setBillingStartDate] = useState("");
  const [billingEndDate, setBillingEndDate] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [latestPeriod, setLatestPeriod] = useState<any>(null);
  const [autoStartDate, setAutoStartDate] = useState<string>("");
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  const session = getSession();
  const createdBy = session?.username || "system";

  // Load all clients
  useEffect(() => {
    const buckets: Bucket[] = ["clients", "leads", "customers"];
    const unsubscribers: Array<() => void> = [];
    const allRecords: { [key in Bucket]: RegistryRecord[] } = { clients: [], leads: [], customers: [] };

    buckets.forEach((bucket) => {
      const unsub = subscribeToRecords(bucket, (records) => {
        allRecords[bucket] = records;
        const combined = Object.values(allRecords).flat();
        setClients(combined.filter((r) => !r.isDeleted));
      });
      unsubscribers.push(unsub);
    });

    return () => unsubscribers.forEach((unsub) => unsub());
  }, []);

  // Fetch latest billing period when client changes
  useEffect(() => {
    if (selectedClient) {
      (async () => {
        console.log({ step: "FETCH_BILLING_PERIOD_START", clientId: selectedClient.id });
        try {
          const [latest, nextStart] = await Promise.all([
            getLatestBillingPeriod(selectedClient.id),
            getNextBillingStartDate(selectedClient.id),
          ]);
          console.log({ step: "FETCH_BILLING_PERIOD_SUCCESS", latest, nextStart });
          setLatestPeriod(latest);
          setAutoStartDate(nextStart);
          setBillingStartDate(nextStart);
          setValidationMsg(null);
        } catch (err) {
          console.error({ step: "FETCH_BILLING_PERIOD_FAILED", err });
        }
      })();
    }
  }, [selectedClient]);

  // Validate billing period
  useEffect(() => {
    if (selectedClient && billingStartDate && billingEndDate) {
      (async () => {
        console.log({
          step: "VALIDATION_START",
          selectedClientId: selectedClient.id,
          selectedClientName: selectedClient.name,
          billingStartDate,
          billingEndDate,
          selectedServices,
          amount: unitPrice,
        });

        const validation = await validateBillingPeriodSequence(
          selectedClient.id,
          billingStartDate,
          billingEndDate,
        );

        console.log({
          step: "VALIDATION_RESULT",
          validation,
          billingStartDate,
          billingEndDate,
          selectedServicesLength: selectedServices.length,
          selectedServices,
          amount: Number(unitPrice),
        });

        if (!validation.valid) {
          setValidationMsg(`❌ ${validation.reason}`);
        } else {
          setValidationMsg("✓ Valid billing period");
        }
      })();
    } else {
      setValidationMsg(null);
    }
  }, [selectedClient, billingStartDate, billingEndDate, selectedServices, unitPrice]);

  // Filter clients by search
  const filteredClients = clients.filter((c) =>
    searchTerm === "" || c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.mo?.includes(searchTerm),
  );

  // Handle service selection
  const toggleService = (serviceName: string) => {
    setSelectedServices((prev) =>
      prev.includes(serviceName) ? prev.filter((s) => s !== serviceName) : [...prev, serviceName],
    );
  };

  const isFormValid =
    !!selectedClient &&
    !!billingStartDate &&
    !!billingEndDate &&
    selectedServices.length > 0 &&
    Number(unitPrice) > 0 &&
    validationMsg?.includes("✓");

  // Create invoice
  const handleCreateInvoice = async () => {
    console.log({ step: "BUTTON_CLICKED", selectedClient, billingStartDate, billingEndDate, selectedServices, unitPrice, isFormValid });

    if (!selectedClient) {
      setError("Please select a client");
      return;
    }
    if (!billingStartDate || !billingEndDate) {
      setError("Please select billing period");
      return;
    }
    if (selectedServices.length === 0) {
      setError("Please select at least one service");
      return;
    }
    if (!unitPrice || Number(unitPrice) <= 0 || Number.isNaN(Number(unitPrice))) {
      setError("Please enter valid unit price");
      return;
    }
    if (!validationMsg?.includes("✓")) {
      setError("Please fix billing date validation before creating the invoice.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const parsedAmount = Number(unitPrice);
    const tax = parsedAmount * 0.18; // 18% GST
    const services: InvoiceServiceItem[] = selectedServices.map((serviceName) => ({
      serviceId: `svc-${Date.now()}-${serviceName.replace(/\s+/g, "-")}`,
      serviceName,
      vehicleNumber: selectedClient.mvNo || "",
      quantity: 1,
      unitPrice: parsedAmount,
      amount: parsedAmount,
      tax,
      total: parsedAmount + tax,
    }));

    console.log({
      step: "INVOICE_PAYLOAD_PREPARED",
      selectedClientId: selectedClient.id,
      selectedClientName: selectedClient.name,
      billingStartDate,
      billingEndDate,
      selectedServices,
      parsedAmount,
      tax,
      services,
      isFormValid,
    });

    try {
      const invoice = await createInvoice(
        selectedClient,
        services,
        billingStartDate,
        billingEndDate,
        createdBy,
      );

      console.log({ step: "INVOICE_CREATED", invoice });

      setSuccess(`✓ Invoice ${invoice.invoiceNumber} created successfully!`);
      setSelectedClient(null);
      setBillingStartDate("");
      setBillingEndDate("");
      setUnitPrice("");
      setSelectedServices([]);
      setValidationMsg(null);

      onInvoiceCreated?.(invoice);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error("INVOICE_CREATE_FAILED", err);
      setError(err?.message || "Failed to create invoice");
    } finally {
      setLoading(false);
    }
  };

  const serviceNames = [
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
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Generate New Invoice</h3>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="size-5 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
            <CheckCircle2 className="size-5 text-green-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-green-700">{success}</p>
          </div>
        )}

        {validationMsg && (
          <div className={`mb-4 p-3 rounded-lg flex items-start gap-2 ${validationMsg.includes("✓") ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
            <AlertCircle className={`size-5 mt-0.5 flex-shrink-0 ${validationMsg.includes("✓") ? "text-green-600" : "text-red-600"}`} />
            <p className={`text-sm ${validationMsg.includes("✓") ? "text-green-700" : "text-red-700"}`}>{validationMsg}</p>
          </div>
        )}

        <div className="space-y-4">
          {/* Client Selection */}
          <div>
            <label className="text-sm font-medium">Select Client *</label>
            <div className="mt-2 relative">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or mobile..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            {searchTerm && (
              <div className="mt-2 border rounded-lg max-h-40 overflow-y-auto">
                {filteredClients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => {
                      setSelectedClient(client);
                      setSearchTerm("");
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 border-b last:border-b-0"
                  >
                    <div className="font-medium">{client.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {client.mo} • {client.mvNo}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedClient && (
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium">{selectedClient.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedClient.mo} • {selectedClient.mvNo}
                </p>
              </div>
            )}
          </div>

          {/* Billing Period */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Billing Start Date *</label>
              <Input
                type="date"
                value={billingStartDate}
                onChange={(e) => setBillingStartDate(e.target.value)}
                className="mt-1"
              />
              {latestPeriod && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last period ended: {latestPeriod.periodEnd}
                </p>
              )}
              {autoStartDate && (
                <p className="text-xs text-muted-foreground mt-1">
                  Suggested next start date: {autoStartDate}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Billing End Date *</label>
              <Input
                type="date"
                value={billingEndDate}
                onChange={(e) => setBillingEndDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {/* Service Selection */}
          <div>
            <label className="text-sm font-medium">Select Services *</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {serviceNames.map((service) => (
                <label key={service} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedServices.includes(service)}
                    onChange={() => toggleService(service)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">{service}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Unit Price */}
          <div>
            <label className="text-sm font-medium">Service Amount (₹) *</label>
            <Input
              type="number"
              placeholder="Enter amount"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="mt-1"
            />
            {unitPrice && (
              <p className="text-xs text-muted-foreground mt-1">
                Tax (18%): ₹{(Number(unitPrice) * 0.18).toFixed(2)} | Total: ₹{(Number(unitPrice) * 1.18).toFixed(2)}
              </p>
            )}
          </div>

          {/* Create Button */}
          <Button
            onClick={handleCreateInvoice}
            disabled={loading || !isFormValid}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Creating Invoice...
              </>
            ) : (
              "Generate Invoice"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
