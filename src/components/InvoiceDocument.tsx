import { formatCurrency, formatDate } from "@/lib/formatting";
import type { Invoice } from "@/lib/billing";

interface InvoiceDocumentProps {
  invoice: Invoice;
}

const COMPANY_NAME = "Shree Sainath Consultancy";
const COMPANY_ADDRESS = "Professional Consulting Services";
const GST_NUMBER = "27AABCT1234H1Z0";
const CONTACT_NUMBER = "+91 98765 43210";
const CONTACT_EMAIL = "info@sainath-consultancy.com";

function safeText(value?: string): string {
  return value && value.trim() ? value : "—";
}

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

export function InvoiceDocument({ invoice }: InvoiceDocumentProps) {
  return (
    <div className="bg-white text-slate-900">
      <div className="border-b pb-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white text-lg font-bold">
              SS
            </div>
            <div>
              <h1 className="text-3xl font-bold text-blue-600">INVOICE</h1>
              <p className="text-sm text-slate-600">{COMPANY_NAME}</p>
              <p className="text-sm text-slate-600">{COMPANY_ADDRESS}</p>
            </div>
          </div>
          <div className="text-left lg:text-right">
            <p className="text-2xl font-bold text-slate-800">{safeText(invoice.invoiceNumber)}</p>
            <div className="mt-2 text-sm text-slate-700">
              <p>Invoice Date: {formatDate(invoice.invoiceDate)}</p>
              <p>
                Billing Period: {formatDate(invoice.billingPeriodStart)} to{" "}
                {formatDate(invoice.billingPeriodEnd)}
              </p>
            </div>
            <span
              className={`inline-flex mt-3 px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor(invoice.status || "")}`}
            >
              {safeText(invoice.status)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mt-4 text-sm text-slate-700">
          <div>
            <p className="font-medium text-slate-700">GST Number:</p>
            <p>{GST_NUMBER}</p>
          </div>
          <div>
            <p className="font-medium text-slate-700">Contact:</p>
            <p>{CONTACT_NUMBER}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="font-medium text-slate-700">Email:</p>
            <p>{CONTACT_EMAIL}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 pb-6 border-b">
        <div>
          <h3 className="font-bold text-slate-800 mb-3">BILL TO</h3>
          <div className="space-y-1 text-sm text-slate-700">
            <p className="font-medium">{safeText(invoice.clientName)}</p>
            <p>Mobile: {safeText(invoice.clientMobile)}</p>
            <p>Address: {safeText(invoice.clientAddress)}</p>
            <p>
              Vehicle: {safeText(invoice.vehicleNumber)} ({safeText(invoice.vehicleType)})
            </p>
            <p className="text-slate-500">Client ID: {safeText(invoice.clientId)}</p>
          </div>
        </div>
        <div>
          <div className="space-y-2 text-sm text-slate-700">
            <div className="flex justify-between">
              <span className="font-medium text-slate-700">Invoice Date:</span>
              <span>{formatDate(invoice.invoiceDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-slate-700">Billing Period:</span>
              <span>
                {formatDate(invoice.billingPeriodStart)} to {formatDate(invoice.billingPeriodEnd)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-slate-700">Created By:</span>
              <span>{safeText(invoice.createdBy)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-slate-700">Created At:</span>
              <span>{formatDate(invoice.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="pb-6">
        <h3 className="font-bold text-slate-800 mb-3">SERVICES</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b-2 text-slate-700">
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
                <tr key={idx} className="border-b hover:bg-slate-50 text-slate-700">
                  <td className="px-4 py-2">{service.serviceName}</td>
                  <td className="px-4 py-2">{service.vehicleNumber}</td>
                  <td className="px-4 py-2 text-center">{service.quantity}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(service.unitPrice)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(service.amount)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(service.tax)}</td>
                  <td className="px-4 py-2 text-right font-medium">
                    {formatCurrency(service.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end pb-6">
        <div className="w-full max-w-xs space-y-2 border-t-2 pt-4 text-sm text-slate-700">
          <div className="flex justify-between">
            <span className="text-slate-700">Subtotal:</span>
            <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-700">Tax (18%):</span>
            <span className="font-medium">{formatCurrency(invoice.totalTax)}</span>
          </div>
          <div className="flex justify-between bg-blue-50 p-2 rounded font-bold text-lg text-slate-900">
            <span>TOTAL:</span>
            <span className="text-blue-600">{formatCurrency(invoice.totalAmount)}</span>
          </div>
        </div>
      </div>

      <div className="bg-slate-50 p-4 rounded-lg border text-slate-700">
        <h4 className="font-bold text-sm text-slate-800 mb-2">Terms & Conditions</h4>
        <ul className="text-xs space-y-1">
          <li>• Payment terms: Due within 30 days of invoice date</li>
          <li>• This invoice is valid only if signed by authorized personnel</li>
          <li>• Please remit payment to the account mentioned in our communications</li>
          <li>• For any queries, please contact us at {CONTACT_EMAIL}</li>
          <li>• This is a computer-generated document and does not require a signature</li>
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-8 pt-8 lg:grid-cols-2 text-slate-700">
        <div>
          <div className="border-t-2 border-slate-800 pt-2 mt-8">
            <p className="text-sm font-medium text-slate-800">Authorized Signatory</p>
            <p className="text-xs text-slate-500">Name & Date</p>
          </div>
        </div>
        <div>
          <div className="border-t-2 border-slate-800 pt-2 mt-8">
            <p className="text-sm font-medium text-slate-800">Client Signature</p>
            <p className="text-xs text-slate-500">Name & Date</p>
          </div>
        </div>
      </div>
    </div>
  );
}
