// InvoiceViewer Component - Display full invoice details
import { Download, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateInvoicePDF, printWindow, formatCurrency, formatDate, formatTime } from "@/lib/pdfGenerator";
import type { Invoice } from "@/lib/billing";

interface InvoiceViewerProps {
  invoice: Invoice;
  onClose: () => void;
}

export function InvoiceViewer({ invoice, onClose }: InvoiceViewerProps) {
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "Paid":
        return "bg-green-100 text-green-800";
      case "Partially Paid":
        return "bg-yellow-100 text-yellow-800";
      case "Pending":
        return "bg-orange-100 text-orange-800";
      case "Cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const COMPANY_NAME = "Shree Sainath Consultancy";
  const COMPANY_ADDRESS = "Professional Consulting Services";
  const GST_NUMBER = "27AABCT1234H1Z0"; // Example GST number
  const CONTACT_NUMBER = "+91 98765 43210";
  const CONTACT_EMAIL = "info@sainath-consultancy.com";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header with Close Button */}
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Invoice {invoice.invoiceNumber}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="size-6" />
          </button>
        </div>

        {/* Invoice Content */}
        <div className="p-8 space-y-6">
          {/* Header Section */}
          <div className="border-b pb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold text-blue-600">INVOICE</h1>
                <p className="text-sm text-muted-foreground">{COMPANY_NAME}</p>
                <p className="text-sm text-muted-foreground">{COMPANY_ADDRESS}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-800">{invoice.invoiceNumber}</p>
                <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor(invoice.status)}`}>
                  {invoice.status}
                </span>
              </div>
            </div>

            {/* Company Contact Details */}
            <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
              <div>
                <p className="font-medium text-gray-700">GST Number:</p>
                <p className="text-gray-600">{GST_NUMBER}</p>
              </div>
              <div>
                <p className="font-medium text-gray-700">Contact:</p>
                <p className="text-gray-600">{CONTACT_NUMBER}</p>
              </div>
              <div className="col-span-2">
                <p className="font-medium text-gray-700">Email:</p>
                <p className="text-gray-600">{CONTACT_EMAIL}</p>
              </div>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-2 gap-6 pb-6 border-b">
            <div>
              <h3 className="font-bold text-gray-800 mb-3">BILL TO</h3>
              <div className="space-y-1 text-sm">
                <p className="font-medium">{invoice.clientName}</p>
                <p>Mobile: {invoice.clientMobile || "—"}</p>
                <p>Address: {invoice.clientAddress || "—"}</p>
                <p>Vehicle: {invoice.vehicleNumber || "—"} ({invoice.vehicleType || "—"})</p>
                <p className="text-muted-foreground">Client ID: {invoice.clientId}</p>
              </div>
            </div>
            <div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium text-gray-700">Invoice Date:</span>
                  <span>{formatDate(invoice.invoiceDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-gray-700">Billing Period:</span>
                  <span>{formatDate(invoice.billingPeriodStart)} to {formatDate(invoice.billingPeriodEnd)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-gray-700">Created By:</span>
                  <span>{invoice.createdBy}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-gray-700">Created At:</span>
                  <span>{formatDate(invoice.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Services Table */}
          <div className="pb-6">
            <h3 className="font-bold text-gray-800 mb-3">SERVICES</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b-2">
                    <th className="px-4 py-2 text-left font-bold">Service</th>
                    <th className="px-4 py-2 text-left font-bold">Vehicle</th>
                    <th className="px-4 py-2 text-center font-bold">Qty</th>
                    <th className="px-4 py-2 text-right font-bold">Unit Price</th>
                    <th className="px-4 py-2 text-right font-bold">Amount</th>
                    <th className="px-4 py-2 text-right font-bold">Tax</th>
                    <th className="px-4 py-2 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.services.map((service, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2">{service.serviceName}</td>
                      <td className="px-4 py-2">{service.vehicleNumber}</td>
                      <td className="px-4 py-2 text-center">{service.quantity}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(service.unitPrice)}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(service.amount)}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(service.tax)}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatCurrency(service.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          <div className="flex justify-end pb-6">
            <div className="w-64 space-y-2 border-t-2 pt-4">
              <div className="flex justify-between">
                <span className="text-gray-700">Subtotal:</span>
                <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Tax (18%):</span>
                <span className="font-medium">{formatCurrency(invoice.totalTax)}</span>
              </div>
              <div className="flex justify-between bg-blue-50 p-2 rounded font-bold text-lg">
                <span>TOTAL:</span>
                <span className="text-blue-600">{formatCurrency(invoice.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Terms & Conditions */}
          <div className="bg-gray-50 p-4 rounded-lg border">
            <h4 className="font-bold text-sm text-gray-800 mb-2">Terms & Conditions</h4>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• Payment terms: Due within 30 days of invoice date</li>
              <li>• This invoice is valid only if signed by authorized personnel</li>
              <li>• Please remit payment to the account mentioned in our communications</li>
              <li>• For any queries, please contact us at {CONTACT_EMAIL}</li>
              <li>• This is a computer-generated document and does not require a signature</li>
            </ul>
          </div>

          {/* Signature Area */}
          <div className="grid grid-cols-2 gap-8 pt-8">
            <div>
              <div className="border-t-2 border-gray-800 pt-2 mt-8">
                <p className="text-sm font-medium text-gray-800">Authorized Signatory</p>
                <p className="text-xs text-muted-foreground">Name & Date</p>
              </div>
            </div>
            <div>
              <div className="border-t-2 border-gray-800 pt-2 mt-8">
                <p className="text-sm font-medium text-gray-800">Client Signature</p>
                <p className="text-xs text-muted-foreground">Name & Date</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="sticky bottom-0 bg-gray-50 border-t p-4 flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={printWindow}
          >
            <Printer className="size-4 mr-2" />
            Print
          </Button>
          <Button
            onClick={() => generateInvoicePDF(invoice)}
          >
            <Download className="size-4 mr-2" />
            Download PDF
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
