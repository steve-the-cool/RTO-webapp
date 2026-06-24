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
  calculateInvoiceAmount,
  type InvoiceServiceItem,
  type Invoice,
} from "@/lib/billing";
import { getSession } from "@/lib/auth";
import { subscribeAllClients } from "@/lib/hierarchy";

interface InvoiceGeneratorProps {
  onInvoiceCreated?: (invoice: Invoice) => void;
}

export function InvoiceGenerator({ onInvoiceCreated }: InvoiceGeneratorProps) {
  const [clients, setClients] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
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
  const [breakdown, setBreakdown] = useState<any[]>([]);

  const session = getSession();
  const createdBy = session?.username || "system";

  // Load all V2 clients
  useEffect(() => {
    const unsub = subscribeAllClients((items) => {
      setClients(items);
    });
    return unsub;
  }, []);

  // Fetch latest billing period when client changes
  useEffect(() => {
    if (selectedClient) {
      console.log({ step: "FETCH_BILLING_PERIOD_START", clientId: selectedClient.id });
      (async () => {
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

  // Recalculate invoice amount and breakdown dynamically
  useEffect(() => {
    if (selectedClient && selectedServices.length > 0) {
      (async () => {
        try {
          const res = await calculateInvoiceAmount(selectedClient.id, selectedServices);
          setUnitPrice(String(res.totalAmount));
          setBreakdown(res.breakdown);
          
          // Debugging logs requested by prompt
          console.log("[Billing] Selected Client", selectedClient.id);
          console.log("[Billing] Selected Services", selectedServices);
          console.log("[Billing] Service Breakdown", res.breakdown);
          console.log("[Billing] Calculated Invoice Amount", res.totalAmount);
        } catch (err) {
          console.error("Failed to calculate invoice amount:", err);
          setUnitPrice("0");
          setBreakdown([]);
        }
      })();
    } else {
      setUnitPrice("0");
      setBreakdown([]);
    }
  }, [selectedClient, selectedServices]);

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

        try {
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
        } catch (err: any) {
          console.error("VALIDATION_ERROR", err);
          setValidationMsg(`❌ ${err?.message || "Billing validation failed."}`);
        }
      })();
    } else {
      setValidationMsg(null);
    }
  }, [selectedClient, billingStartDate, billingEndDate, selectedServices, unitPrice]);

  // Filter clients by search
  const filteredClients = clients.filter((c) =>
    searchTerm === "" || c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.mobile?.includes(searchTerm),
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
      setError("Calculation returned no services or 0 amount.");
      return;
    }
    if (!validationMsg?.includes("✓")) {
      setError("Please fix billing date validation before creating the invoice.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const services: InvoiceServiceItem[] = breakdown.map((item) => {
      const price = item.amount;
      const tax = price * 0.18;
      return {
        serviceId: item.serviceId || `svc-${Date.now()}-${item.serviceName.replace(/\s+/g, "-")}-${item.vehicleNumber}`,
        serviceName: item.serviceName,
        vehicleNumber: item.vehicleNumber,
        quantity: 1,
        unitPrice: price,
        amount: price,
        tax,
        total: price + tax,
      };
    });

    console.log({
      step: "INVOICE_PAYLOAD_PREPARED",
      selectedClientId: selectedClient.id,
      selectedClientName: selectedClient.name,
      billingStartDate,
      billingEndDate,
      selectedServices,
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
      setBreakdown([]);

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
    "License New",
    "License Renew",
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
                      {client.mobile} {client.companyName ? `• ${client.companyName}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedClient && (
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium">{selectedClient.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedClient.mobile} {selectedClient.companyName ? `• ${selectedClient.companyName}` : ""}
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

          {/* Breakdown of selected services across vehicles */}
          {selectedClient && selectedServices.length > 0 && breakdown.length > 0 && (
            <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-border space-y-2">
              <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wide">Invoice Breakdown</h4>
              <div className="space-y-2.5 text-xs">
                {selectedServices.map((serviceName) => {
                  const serviceItems = breakdown.filter((item) => item.serviceName === serviceName);
                  if (serviceItems.length === 0) return null;
                  const serviceSubtotal = serviceItems.reduce((sum, item) => sum + item.amount, 0);
                  
                  return (
                    <div key={serviceName} className="border-b border-gray-200/60 pb-1.5 last:border-b-0 last:pb-0">
                      <div className="font-semibold text-foreground">{serviceName}</div>
                      <div className="mt-1 space-y-0.5 pl-2 text-muted-foreground font-mono text-[11px]">
                        {serviceItems.map((item, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span>Vehicle {item.vehicleNumber}</span>
                            <span>₹{item.amount.toLocaleString("en-IN")}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-1 flex justify-between font-semibold pl-2 text-foreground text-[11px]">
                        <span>Total {serviceName}</span>
                        <span>₹{serviceSubtotal.toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                  );
                })}
                <div className="pt-1.5 border-t border-gray-300 flex justify-between font-bold text-foreground text-xs">
                  <span>Grand Total</span>
                  <span>₹{Number(unitPrice).toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>
          )}

          {/* Unit Price */}
          <div>
            <label className="text-sm font-medium">Service Amount (₹) *</label>
            <Input
              type="text"
              readOnly
              disabled
              value={unitPrice ? `₹${Number(unitPrice).toLocaleString("en-IN")}` : "₹0"}
              className="mt-1 bg-muted font-bold text-foreground cursor-not-allowed"
            />
            {unitPrice && Number(unitPrice) > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Tax (18%): ₹{(Number(unitPrice) * 0.18).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Total: ₹{(Number(unitPrice) * 1.18).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
