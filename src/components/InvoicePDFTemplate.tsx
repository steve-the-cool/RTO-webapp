import * as React from "react";
import { formatCurrency, formatDate } from "@/lib/formatting";
import type { Invoice } from "@/lib/billing";

interface InvoicePDFTemplateProps {
  invoice: Invoice;
}

const COMPANY_NAME = "Registry Pro";
const COMPANY_ADDRESS = "102, Business Plaza, Sector 11, CBD Belapur, Navi Mumbai, MH - 400614";
const GST_NUMBER = "27AABCT1234H1Z0";
const CONTACT_NUMBER = "+91 98765 43210";
const CONTACT_EMAIL = "support@registrypro.com";

function safeText(value?: string): string {
  return value && value.trim() ? value : "—";
}

export const InvoicePDFTemplate = React.forwardRef<HTMLDivElement, InvoicePDFTemplateProps>(
  ({ invoice }, ref) => {
    // Group services by name for breakdown
    const groupedServices = invoice.services.reduce(
      (acc, item) => {
        const name = item.serviceName;
        if (!acc[name]) {
          acc[name] = {
            serviceName: name,
            items: [],
            total: 0,
          };
        }
        acc[name].items.push({
          vehicleNumber: item.vehicleNumber || "General/No Vehicle",
          amount: item.total,
        });
        acc[name].total += item.total;
        return acc;
      },
      {} as Record<
        string,
        { serviceName: string; items: { vehicleNumber: string; amount: number }[]; total: number }
      >,
    );

    const groupedList = Object.values(groupedServices);

    // Collect unique vehicle numbers
    const uniqueVehicles = Array.from(
      new Set(
        invoice.services
          .map((s) => s.vehicleNumber)
          .filter((v): v is string => !!v && v.trim() !== ""),
      ),
    );
    const vehiclesStr = uniqueVehicles.length > 0 ? uniqueVehicles.join(", ") : "—";

    // Collect unique services
    const uniqueServicesList = Array.from(new Set(invoice.services.map((s) => s.serviceName)));
    const servicesStr = uniqueServicesList.join(", ");

    const pendingAmount = invoice.totalAmount - (invoice.totalPaid || 0);

    // Calculate a due date (30 days after invoiceDate if not present)
    const getDueDate = () => {
      try {
        const date = new Date(invoice.invoiceDate);
        date.setDate(date.getDate() + 30);
        return date.toISOString().split("T")[0];
      } catch (e) {
        return invoice.invoiceDate;
      }
    };
    const dueDateStr = getDueDate();

    // Status Colors (PDF-safe hex values)
    const getStatusStyle = (status: string) => {
      switch (status) {
        case "Paid":
          return { backgroundColor: "#bbf7d0", color: "#14532d" };
        case "Partially Paid":
          return { backgroundColor: "#fef3c7", color: "#92400e" };
        case "Pending":
          return { backgroundColor: "#ffedd5", color: "#9a3412" };
        case "Cancelled":
          return { backgroundColor: "#fee2e2", color: "#991b1b" };
        default:
          return { backgroundColor: "#f3f4f6", color: "#374151" };
      }
    };

    const statusStyle = getStatusStyle(invoice.status || "");

    return (
      <div
        ref={ref}
        id="invoice-pdf"
        style={{
          backgroundColor: "#ffffff",
          color: "#1e293b",
          fontFamily: "Inter, Arial, sans-serif",
          padding: "32px",
          boxSizing: "border-box",
          width: "100%",
          minHeight: "297mm",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* HEADER SECTION */}
        <div
          style={{
            borderBottom: "2px solid #e2e8f0",
            paddingBottom: "24px",
            marginBottom: "24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                height: "64px",
                width: "64px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "16px",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                fontSize: "20px",
                fontWeight: "bold",
              }}
            >
              RP
            </div>
            <div>
              <h1 style={{ fontSize: "28px", fontWeight: "bold", color: "#2563eb", margin: 0 }}>
                INVOICE
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#1e293b",
                  margin: "4px 0 0 0",
                }}
              >
                {COMPANY_NAME}
              </p>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0 0" }}>
                {COMPANY_ADDRESS}
              </p>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "20px", fontWeight: "bold", color: "#1e293b", margin: 0 }}>
              {safeText(invoice.invoiceNumber)}
            </p>
            <div
              style={{ marginTop: "8px", fontSize: "12px", color: "#475569", lineHeight: "1.5" }}
            >
              <p style={{ margin: 0 }}>Invoice Date: {formatDate(invoice.invoiceDate)}</p>
              <p style={{ margin: 0 }}>Due Date: {formatDate(dueDateStr)}</p>
              <p style={{ margin: 0 }}>
                Billing Period: {formatDate(invoice.billingPeriodStart)} to{" "}
                {formatDate(invoice.billingPeriodEnd)}
              </p>
            </div>
            <span
              style={{
                display: "inline-block",
                marginTop: "12px",
                padding: "4px 12px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: "600",
                ...statusStyle,
              }}
            >
              {safeText(invoice.status)}
            </span>
          </div>
        </div>

        {/* COMPANY & BILL TO DETAILS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
            marginBottom: "32px",
            fontSize: "13px",
            color: "#334155",
          }}
        >
          {/* SENDER INFO */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "#f8fafc",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3
              style={{
                fontSize: "14px",
                fontWeight: "bold",
                color: "#1e293b",
                margin: "0 0 10px 0",
              }}
            >
              COMPANY DETAILS
            </h3>
            <p style={{ margin: "4px 0" }}>
              <strong>GSTIN:</strong> {GST_NUMBER}
            </p>
            <p style={{ margin: "4px 0" }}>
              <strong>Phone:</strong> {CONTACT_NUMBER}
            </p>
            <p style={{ margin: "4px 0" }}>
              <strong>Email:</strong> {CONTACT_EMAIL}
            </p>
          </div>

          {/* BILL TO */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "#f8fafc",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3
              style={{
                fontSize: "14px",
                fontWeight: "bold",
                color: "#1e293b",
                margin: "0 0 10px 0",
              }}
            >
              BILL TO
            </h3>
            <p style={{ margin: "4px 0", fontSize: "14px", fontWeight: "600", color: "#0f172a" }}>
              {safeText(invoice.clientName)}
            </p>
            <p style={{ margin: "4px 0" }}>
              <strong>Mobile:</strong> {safeText(invoice.clientMobile)}
            </p>
            <p style={{ margin: "4px 0" }}>
              <strong>Address:</strong> {safeText(invoice.clientAddress)}
            </p>
            <p style={{ margin: "4px 0" }}>
              <strong>GSTIN:</strong> —
            </p>
          </div>
        </div>

        {/* VEHICLES SUMMARY */}
        <div
          style={{
            marginBottom: "24px",
            padding: "12px 16px",
            backgroundColor: "#f1f5f9",
            borderRadius: "8px",
            fontSize: "13px",
            color: "#334155",
            border: "1px solid #cbd5e1",
          }}
        >
          <h4
            style={{ fontSize: "13px", fontWeight: "bold", color: "#0f172a", margin: "0 0 6px 0" }}
          >
            VEHICLE INFORMATION
          </h4>
          <p style={{ margin: 0 }}>
            <strong>All Vehicles Included:</strong> {vehiclesStr}
          </p>
        </div>

        {/* METADATA LIST */}
        <div
          style={{
            marginBottom: "32px",
            padding: "12px 16px",
            backgroundColor: "#f8fafc",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#475569",
            lineHeight: "1.6",
            border: "1px dashed #cbd5e1",
          }}
        >
          <p style={{ margin: "2px 0" }}>
            <strong>Selected Services:</strong> {servicesStr}
          </p>
          <p style={{ margin: "2px 0" }}>
            <strong>Created By:</strong> {safeText(invoice.createdBy)}
          </p>
        </div>

        {/* SERVICE BREAKDOWN */}
        <div style={{ flex: 1, marginBottom: "32px" }}>
          <h3
            style={{ fontSize: "15px", fontWeight: "bold", color: "#0f172a", margin: "0 0 12px 0" }}
          >
            SERVICES BREAKDOWN
          </h3>

          {groupedList.map((group, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: "20px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              {/* Group Header */}
              <div
                style={{
                  backgroundColor: "#f8fafc",
                  padding: "10px 16px",
                  fontWeight: "bold",
                  fontSize: "14px",
                  color: "#1e293b",
                  borderBottom: "1px solid #e2e8f0",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{group.serviceName}</span>
                <span>Total: {formatCurrency(group.total)}</span>
              </div>

              {/* Group Items */}
              <div style={{ padding: "0 16px" }}>
                {group.items.map((item, itemIdx) => (
                  <div
                    key={itemIdx}
                    style={{
                      padding: "8px 0",
                      fontSize: "13px",
                      color: "#475569",
                      borderBottom:
                        itemIdx < group.items.length - 1 ? "1px dashed #e2e8f0" : "none",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>Vehicle: {item.vehicleNumber}</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* TOTALS & SUMMARY */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "32px" }}>
          <div
            style={{
              width: "300px",
              borderTop: "2px solid #0f172a",
              paddingTop: "12px",
              fontSize: "13px",
              color: "#334155",
              lineHeight: "2",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Subtotal:</span>
              <span style={{ fontWeight: "600" }}>{formatCurrency(invoice.subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>GST (18%):</span>
              <span style={{ fontWeight: "600" }}>{formatCurrency(invoice.totalTax)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Total:</span>
              <span style={{ fontWeight: "600" }}>{formatCurrency(invoice.totalAmount)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Received:</span>
              <span style={{ fontWeight: "600", color: "#16a34a" }}>
                {formatCurrency(invoice.totalPaid || 0)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Pending:</span>
              <span style={{ fontWeight: "600", color: "#dc2626" }}>
                {formatCurrency(pendingAmount)}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                backgroundColor: "#eff6ff",
                padding: "6px 12px",
                borderRadius: "6px",
                fontWeight: "bold",
                fontSize: "16px",
                color: "#1e3a8a",
                marginTop: "8px",
              }}
            >
              <span>GRAND TOTAL:</span>
              <span>{formatCurrency(invoice.totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div
          style={{
            borderTop: "1px solid #e2e8f0",
            paddingTop: "16px",
            textAlign: "center",
            fontSize: "11px",
            color: "#94a3b8",
          }}
        >
          <p style={{ margin: "2px 0" }}>Generated by {COMPANY_NAME}</p>
          <p style={{ margin: "2px 0" }}>Timestamp: {new Date().toLocaleString("en-IN")}</p>
          <p style={{ margin: "2px 0", fontSize: "10px", color: "#cbd5e1" }}>
            Invoice ID: {invoice.id}
          </p>
        </div>
      </div>
    );
  },
);

InvoicePDFTemplate.displayName = "InvoicePDFTemplate";
