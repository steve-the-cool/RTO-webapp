import jsPDF from "jspdf";
import { attachPdfToInvoice } from "./billing";
import type { RegistryRecord } from "./records";
import type { Task } from "./tasks";
import { staffLabel, getRecordServiceAmount, getRecordPaymentStatus, getRecordPendingAmount } from "./records";
import { formatCurrency, formatDate, formatTime } from "./formatting";
import { renderInvoiceToCanvas } from "./pdfInvoiceRenderer";

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
export { formatCurrency, formatDate, formatTime } from "./formatting";

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

function addCanvasToPdf(doc: jsPDF, canvas: HTMLCanvasElement): void {
  const pdfWidth = doc.internal.pageSize.getWidth();
  const pdfHeight = doc.internal.pageSize.getHeight();
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const pageCanvasHeight = Math.floor((pdfHeight * canvasWidth) / pdfWidth);

  let yOffsetPx = 0;
  let pageIndex = 0;

  while (yOffsetPx < canvasHeight) {
    const sliceHeight = Math.min(pageCanvasHeight, canvasHeight - yOffsetPx);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvasWidth;
    pageCanvas.height = sliceHeight;
    const ctx = pageCanvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to create PDF canvas context.");
    }

    ctx.drawImage(canvas, 0, yOffsetPx, canvasWidth, sliceHeight, 0, 0, canvasWidth, sliceHeight);
    const imgData = pageCanvas.toDataURL("image/png");

    if (pageIndex > 0) {
      doc.addPage();
    }

    const pageImageHeight = (sliceHeight * pdfWidth) / canvasWidth;
    doc.addImage(imgData, "PNG", 0, 0, pdfWidth, pageImageHeight);

    pageIndex += 1;
    yOffsetPx += sliceHeight;
  }
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
  if (getRecordServiceAmount(record) > 0 || record.amountReceived) {
    yPos = addSectionTitle(doc, yPos + 2, "Accounting Information");

    const accountingFields = [
      ["Service Amount", formatCurrency(getRecordServiceAmount(record))],
      ["Amount Received", formatCurrency(record.amountReceived)],
      ["Payment Status", getRecordPaymentStatus(record)],
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
  try {
    const canvas = await renderInvoiceToCanvas(invoice);
    const doc = new jsPDF("p", "mm", "a4");
    addCanvasToPdf(doc, canvas);

    const blob = doc.output("blob") as Blob;
    
    // Always try to download first (blob URL)
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `${invoice.invoiceNumber || "invoice"}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Then upload to Firebase (non-blocking)
    setTimeout(async () => {
      try {
        await attachPdfToInvoice(invoice.id, blob);
      } catch (uploadError) {
        console.warn("Failed to upload PDF to Firebase:", uploadError);
      }
    }, 100);
    
    // Clean up blob URL after a short delay
    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
    
    return blobUrl;
  } catch (error) {
    console.error("Invoice PDF generation failed:", error);
    throw error;
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
      const pending = getRecordPendingAmount(record);
      const row = [
        String(record.srNo),
        record.name.substring(0, 20),
        formatCurrency(getRecordServiceAmount(record)).substring(0, 12),
        formatCurrency(record.amountReceived).substring(0, 12),
        formatCurrency(pending).substring(0, 12),
        getRecordPaymentStatus(record),
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
