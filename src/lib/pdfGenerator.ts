import jsPDF from "jspdf";
import { attachPdfToInvoice } from "./billing";
import type { RegistryRecord } from "./records";
import type { Task } from "./tasks";
import { staffLabel } from "./records";

// ─── Configuration ────────────────────────────────────────────────────────────

const COMPANY_NAME = "Shree Sainath Consultancy";
const COMPANY_ADDRESS = "Professional Consulting Services";
const PAGE_WIDTH = 210; // A4 width in mm
const PAGE_HEIGHT = 297; // A4 height in mm
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

// ─── Color Scheme ─────────────────────────────────────────────────────────────

const COLORS = {
  headerBg: [41, 128, 185] as [number, number, number], // Blue
  headerText: [255, 255, 255] as [number, number, number], // White
  labelText: [52, 73, 94] as [number, number, number], // Dark blue-gray
  valueText: [44, 62, 80] as [number, number, number], // Darker blue-gray
  borderColor: [189, 195, 199] as [number, number, number], // Light gray
  accentColor: [230, 126, 34] as [number, number, number], // Orange
};

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Format currency as Indian Rupees.
 */
export function formatCurrency(amount?: number): string {
  if (amount === undefined || amount === null) return "₹0";
  return `₹${Number(amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/**
 * Format date to readable format.
 */
export function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format time to readable format.
 */
export function formatTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Add header section to PDF.
 */
function addHeader(
  doc: jsPDF,
  recordType: string,
): number {
  let yPos = MARGIN;

  // Header background
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(MARGIN - 2, yPos - 2, PAGE_WIDTH - 2 * MARGIN + 4, 35, "F");

  // Company name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.headerText);
  doc.text(COMPANY_NAME, MARGIN + 5, yPos + 10);

  // Company subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(COMPANY_ADDRESS, MARGIN + 5, yPos + 16);

  // Record type and date on the right
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(recordType, PAGE_WIDTH - MARGIN - 5, yPos + 8, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, PAGE_WIDTH - MARGIN - 5, yPos + 14, {
    align: "right",
  });

  return yPos + 40;
}

/**
 * Add a key-value row to the PDF.
 */
function addRow(
  doc: jsPDF,
  yPos: number,
  label: string,
  value: string,
  columnWidth: number = CONTENT_WIDTH / 2,
): number {
  const lineHeight = 7;

  // Label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.labelText);
  doc.text(label, MARGIN + 3, yPos);

  // Value
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.valueText);

  // Wrap text for long values
  const maxChars = Math.floor((columnWidth - 6) / 1.5);
  if (value.length > maxChars) {
    const wrapped = doc.splitTextToSize(value, columnWidth - 6);
    doc.text(wrapped, MARGIN + columnWidth / 2 + 2, yPos);
    return yPos + wrapped.length * lineHeight + 2;
  } else {
    doc.text(value, MARGIN + columnWidth / 2 + 2, yPos);
    return yPos + lineHeight;
  }
}

/**
 * Add a section title to the PDF.
 */
function addSectionTitle(doc: jsPDF, yPos: number, title: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.accentColor);
  doc.text(title, MARGIN, yPos);

  // Underline
  doc.setDrawColor(...COLORS.borderColor);
  doc.line(MARGIN, yPos + 1.5, MARGIN + CONTENT_WIDTH, yPos + 1.5);

  return yPos + 8;
}

/**
 * Add a table row to the PDF.
 */
function addTableRow(
  doc: jsPDF,
  yPos: number,
  columns: string[],
  columnWidths: number[],
  isBold: boolean = false,
): number {
  const lineHeight = 6;
  doc.setFont("helvetica", isBold ? "bold" : "normal");
  doc.setFontSize(8);
  doc.setTextColor(...(isBold ? COLORS.labelText : COLORS.valueText));

  let xPos = MARGIN;
  for (let i = 0; i < columns.length; i++) {
    const text = columns[i];
    const maxWidth = columnWidths[i] - 1;
    const wrapped = doc.splitTextToSize(text, maxWidth);
    doc.text(wrapped, xPos + 1, yPos);
    xPos += columnWidths[i];
  }

  return yPos + (Math.max(...columns.map((c) => doc.splitTextToSize(c, 20).length)) * lineHeight) + 1;
}

// ─── Client/Lead/Customer PDF ─────────────────────────────────────────────────

/**
 * Generate a professional PDF for a client/lead/customer record.
 */
export function generateRecordPDF(record: RegistryRecord, bucket: "clients" | "leads" | "customers"): void {
  const doc = new jsPDF();
  let yPos = addHeader(doc, `${bucket.charAt(0).toUpperCase() + bucket.slice(1)} Details`);

  // Basic Information Section
  yPos = addSectionTitle(doc, yPos, "Basic Information");

  const fields = [
    ["SR No", String(record.srNo)],
    ["Date", formatDate(record.date)],
    ["Name", record.name],
    ["Group Name", record.groupName || "—"],
    ["Mobile", record.mo || "—"],
    ["Vehicle Number", record.mvNo || "—"],
    ["Assigned Staff", staffLabel(record.assignee) || "—"],
  ];

  for (const [label, value] of fields) {
    yPos = addRow(doc, yPos, label, value);
  }

  // Work Details Section
  yPos = addSectionTitle(doc, yPos + 2, "Work Details");

  const workFields = [
    ["Application", record.application || "—"],
    ["Work Type", record.work || "—"],
    ["Status", record.status || "—"],
  ];

  for (const [label, value] of workFields) {
    yPos = addRow(doc, yPos, label, value);
  }

  // Compliance Details Section
  yPos = addSectionTitle(doc, yPos + 2, "Compliance & Documents");

  const complianceFields = [
    ["Insurance", record.insurance || "—"],
    ["Fitness", record.fitness || "—"],
    ["Tax", record.tax || "—"],
    ["Certificate of Origin", record.co || "—"],
  ];

  for (const [label, value] of complianceFields) {
    yPos = addRow(doc, yPos, label, value);
  }

  // Accounting Information Section
  if (record.serviceAmount || record.amountReceived) {
    yPos = addSectionTitle(doc, yPos + 2, "Accounting Information");

    const accountingFields = [
      ["Service Amount", formatCurrency(record.serviceAmount)],
      ["Amount Received", formatCurrency(record.amountReceived)],
      ["Payment Status", record.paymentStatus || "—"],
      ["Payment Date", formatDate(record.paymentDate)],
    ];

    for (const [label, value] of accountingFields) {
      yPos = addRow(doc, yPos, label, value);
    }
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(189, 195, 199);
  doc.text("This is a computer-generated document", PAGE_WIDTH / 2, PAGE_HEIGHT - 10, { align: "center" });

  // File name
  const fileName = `${bucket.toUpperCase()}_${record.name.replace(/\s+/g, "_").substring(0, 30)}_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

// ─── Task PDF ──────────────────────────────────────────────────────────────────

/**
 * Generate a professional PDF for a task.
 */
export function generateTaskPDF(task: Task): void {
  const doc = new jsPDF();
  let yPos = addHeader(doc, "Task Details");

  // Task Header
  yPos = addSectionTitle(doc, yPos, "Task Information");

  const taskFields = [
    ["Title", task.title],
    ["Assignee", staffLabel(task.assignee) || task.assignee],
    ["Status", task.status],
    ["Priority", task.priority],
    ["Due Date", formatDate(task.dueDate)],
    ["Created On", formatDate(task.createdAt)],
    ["Created By", task.createdBy],
  ];

  for (const [label, value] of taskFields) {
    yPos = addRow(doc, yPos, label, value);
  }

  // Description
  if (task.description) {
    yPos = addSectionTitle(doc, yPos + 2, "Description");
    const wrapped = doc.splitTextToSize(task.description, CONTENT_WIDTH - 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.valueText);
    doc.text(wrapped, MARGIN + 3, yPos);
    yPos += wrapped.length * 5 + 3;
  }

  // Read Status
  if (task.readBy || task.readAt) {
    yPos = addSectionTitle(doc, yPos + 2, "Read Status");

    const readFields = [
      ["Read By", staffLabel(task.readBy) || "Pending"],
      ["Read On", formatTime(task.readAt) || "Not read yet"],
    ];

    for (const [label, value] of readFields) {
      yPos = addRow(doc, yPos, label, value);
    }
  }

  // Subtasks
  if (task.subtasks && task.subtasks.length > 0) {
    yPos = addSectionTitle(doc, yPos + 2, "Subtasks");

    // Progress bar
    const progress = task.progress ?? 0;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.labelText);
    doc.text(`Progress: ${progress}%`, MARGIN + 3, yPos);

    // Progress bar background
    doc.setDrawColor(...COLORS.borderColor);
    doc.rect(MARGIN + 50, yPos - 3, 40, 3);

    // Progress bar fill
    doc.setFillColor(...COLORS.accentColor);
    doc.rect(MARGIN + 50, yPos - 3, (40 * progress) / 100, 3, "F");

    yPos += 6;

    // Subtask list
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    for (const subtask of task.subtasks) {
      const status = subtask.completed ? "✓" : "○";
      const text = `${status} ${subtask.title}`;
      const wrapped = doc.splitTextToSize(text, CONTENT_WIDTH - 10);
      doc.setTextColor(...COLORS.valueText);
      doc.text(wrapped, MARGIN + 5, yPos);
      yPos += wrapped.length * 4 + 1;
    }
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(189, 195, 199);
  doc.text("This is a computer-generated document", PAGE_WIDTH / 2, PAGE_HEIGHT - 10, { align: "center" });

  // File name
  const fileName = `TASK_${task.id.substring(0, 8)}_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

/**
 * Generate a professional invoice PDF, upload to storage, and trigger download.
 * Returns the uploaded URL when successful.
 */
export async function generateInvoicePDF(invoice: Invoice): Promise<string | void> {
  const doc = new jsPDF();
  let yPos = MARGIN;

  // ─── Header Section ───────────────────────────────────────────────────
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(MARGIN - 2, yPos - 2, PAGE_WIDTH - 2 * MARGIN + 4, 30, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...COLORS.headerText);
  doc.text("INVOICE", MARGIN + 5, yPos + 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(COMPANY_NAME, MARGIN + 5, yPos + 18);
  doc.setFontSize(8);
  doc.text(COMPANY_ADDRESS, MARGIN + 5, yPos + 23);

  // Invoice number and date on right
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.accentColor);
  doc.text(invoice.invoiceNumber, PAGE_WIDTH - MARGIN - 5, yPos + 6, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.labelText);
  doc.text(`Invoice Date: ${formatDate(invoice.invoiceDate)}`, PAGE_WIDTH - MARGIN - 5, yPos + 12, { align: "right" });
  doc.text(`Billing Period: ${formatDate(invoice.billingPeriodStart)} to ${formatDate(invoice.billingPeriodEnd)}`, PAGE_WIDTH - MARGIN - 5, yPos + 17, { align: "right" });

  yPos += 35;

  // Client and services sections (reuse existing logic from below)
  yPos = addSectionTitle(doc, yPos, "BILL TO");
  const clientFields = [
    ["Client Name", invoice.clientName],
    ["Mobile Number", invoice.clientMobile || "—"],
    ["Address", invoice.clientAddress || "—"],
    ["Vehicle Number", invoice.vehicleNumber || "—"],
    ["Vehicle Type", invoice.vehicleType || "—"],
    ["Client ID", invoice.clientId],
  ];
  for (const [label, value] of clientFields) {
    yPos = addRow(doc, yPos, label, value);
  }

  yPos += 3;
  yPos = addSectionTitle(doc, yPos, "SERVICES");

  // Table header
  const colWidths = [30, 35, 15, 20, 25, 20, 25];
  const headers = ["Service", "Vehicle", "Qty", "Unit Price", "Amount", "Tax", "Total"];

  doc.setDrawColor(...COLORS.borderColor);
  doc.setFillColor(...COLORS.headerBg);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.headerText);

  let xPos = MARGIN;
  for (let i = 0; i < headers.length; i++) {
    doc.rect(xPos, yPos - 4, colWidths[i], 6, "F");
    doc.text(headers[i], xPos + 1, yPos - 1);
    xPos += colWidths[i];
  }

  yPos += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  for (const service of invoice.services) {
    const row = [
      (service.serviceName || "").substring(0, 20),
      (service.vehicleNumber || "").substring(0, 15),
      String(service.quantity || 1),
      formatCurrency(service.unitPrice).substring(0, 12),
      formatCurrency(service.amount).substring(0, 12),
      formatCurrency(service.tax).substring(0, 12),
      formatCurrency(service.total).substring(0, 12),
    ];

    xPos = MARGIN;
    for (let i = 0; i < row.length; i++) {
      doc.setTextColor(...COLORS.valueText);
      doc.text(row[i], xPos + 1, yPos);
      xPos += colWidths[i];
    }

    yPos += 5;
    if (yPos > PAGE_HEIGHT - MARGIN - 40) {
      doc.addPage();
      yPos = MARGIN;
    }
  }

  // Summary
  const summaryX = MARGIN + CONTENT_WIDTH - 60;
  const summaryWidth = 55;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.labelText);
  doc.text("Subtotal:", summaryX, yPos);
  doc.setTextColor(...COLORS.valueText);
  doc.text(formatCurrency(invoice.subtotal), summaryX + summaryWidth - 2, yPos, { align: "right" });
  yPos += 5;
  doc.setTextColor(...COLORS.labelText);
  doc.text("Tax (18%):", summaryX, yPos);
  doc.setTextColor(...COLORS.valueText);
  doc.text(formatCurrency(invoice.totalTax), summaryX + summaryWidth - 2, yPos, { align: "right" });
  yPos += 5;
  doc.setFillColor(...COLORS.accentColor);
  doc.rect(summaryX - 2, yPos - 4, summaryWidth + 4, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.headerText);
  doc.text("TOTAL:", summaryX, yPos);
  doc.text(formatCurrency(invoice.totalAmount), summaryX + summaryWidth - 2, yPos, { align: "right" });
  yPos += 12;

  // Footer & signature
  yPos = addSectionTitle(doc, yPos, "AUTHORIZED BY");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.valueText);
  doc.line(MARGIN, yPos + 10, MARGIN + 40, yPos + 10);
  doc.text("Authorized Signatory", MARGIN + 5, yPos + 12);
  doc.line(MARGIN + CONTENT_WIDTH - 40, yPos + 10, MARGIN + CONTENT_WIDTH, yPos + 10);
  doc.text("Date", MARGIN + CONTENT_WIDTH - 35, yPos + 12);

  // Terms
  let termsY = PAGE_HEIGHT - 25;
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  const terms = [
    "• Payment terms: Due within 30 days of invoice date",
    "• This invoice is valid only if signed by authorized personnel",
    "• Please remit payment to the account mentioned in the invoice",
    "• For any queries, please contact us",
  ];
  for (const term of terms) {
    doc.text(term, MARGIN + 3, termsY);
    termsY += 3;
  }

  // Save blob, upload, then trigger download (best-effort)
  const blob = doc.output("blob");
  try {
    const url = await attachPdfToInvoice(invoice.id, blob as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.invoiceNumber}.pdf`;
    a.click();
    return url;
  } catch (e) {
    const url = URL.createObjectURL(blob as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.invoiceNumber}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return url;
  }
}

// ─── Accounting Report PDF ────────────────────────────────────────────────────

/**
 * Generate an accounting report PDF.
 */
export function generateAccountingPDF(
  records: RegistryRecord[],
  summary: {
    totalServiceAmount: number;
    totalAmountReceived: number;
    totalPendingAmount: number;
    collectionRate: number;
  },
): void {
  const doc = new jsPDF();
  let yPos = addHeader(doc, "Accounting Report");

  // Summary Section
  yPos = addSectionTitle(doc, yPos, "Financial Summary");

  const summaryFields = [
    ["Total Revenue", formatCurrency(summary.totalServiceAmount)],
    ["Amount Collected", formatCurrency(summary.totalAmountReceived)],
    ["Pending Revenue", formatCurrency(summary.totalPendingAmount)],
    ["Collection Rate", `${summary.collectionRate.toFixed(2)}%`],
  ];

  for (const [label, value] of summaryFields) {
    yPos = addRow(doc, yPos, label, value);
  }

  // Detailed Records Section
  if (records.length > 0) {
    yPos = addSectionTitle(doc, yPos + 3, "Detailed Records");

    // Table headers
    const colWidths = [30, 40, 25, 25, 25, 25];
    const headers = ["SR No", "Name", "Service Amt", "Received", "Pending", "Status"];

    doc.setDrawColor(...COLORS.borderColor);
    doc.setFillColor(...COLORS.headerBg);
    yPos = addTableRow(doc, yPos, headers, colWidths, true);

    // Add border line
    doc.line(MARGIN, yPos - 1, MARGIN + CONTENT_WIDTH, yPos - 1);

    // Table rows
    for (const record of records.slice(0, 20)) {
      const pending = (record.serviceAmount || 0) - (record.amountReceived || 0);
      const row = [
        String(record.srNo),
        record.name.substring(0, 20),
        formatCurrency(record.serviceAmount).substring(0, 12),
        formatCurrency(record.amountReceived).substring(0, 12),
        formatCurrency(pending).substring(0, 12),
        record.paymentStatus || "—",
      ];

      yPos = addTableRow(doc, yPos, row, colWidths, false);

      // Page break if needed
      if (yPos > PAGE_HEIGHT - MARGIN - 10) {
        doc.addPage();
        yPos = MARGIN;
      }
    }

    if (records.length > 20) {
      yPos = addRow(doc, yPos + 2, "Records shown", `First 20 of ${records.length}`);
    }
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(189, 195, 199);
  doc.text("This is a computer-generated document", PAGE_WIDTH / 2, PAGE_HEIGHT - 10, { align: "center" });

  // File name
  const fileName = `ACCOUNTING_REPORT_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

// ─── Print Helpers ────────────────────────────────────────────────────────────

/**
 * Open browser print dialog for a PDF.
 * Note: This prints the current page, not a generated PDF.
 */
export function printWindow(): void {
  window.print();
}

export default {};
