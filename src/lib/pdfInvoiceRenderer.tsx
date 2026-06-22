import * as React from "react";
import html2canvas from "html2canvas";
import { createRoot } from "react-dom/client";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import type { Invoice } from "./billing";

const PAGE_WIDTH = 210; // A4 width in mm

export async function renderInvoiceToCanvas(invoice: Invoice): Promise<HTMLCanvasElement> {
  if (typeof document === "undefined") {
    throw new Error("Invoice PDF generation requires a browser environment.");
  }

  const mmToPx = 3.7795275591;
  const widthPx = Math.round(PAGE_WIDTH * mmToPx);
  const scale = Math.min(4, Math.max(3, window.devicePixelRatio || 1));

  const container = document.createElement("div");
  container.id = "pdf-renderer-container";
  container.style.position = "fixed";
  container.style.left = "-999999px";
  container.style.top = "0";
  container.style.width = `${widthPx}px`;
  container.style.minHeight = "297mm";
  container.style.boxSizing = "border-box";
  container.style.padding = "24px";
  container.style.background = "#ffffff";
  container.style.color = "#0f172a";
  container.style.visibility = "visible";
  container.style.opacity = "0";
  container.style.fontFamily = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  container.style.zIndex = "-9999";
  container.style.pointerEvents = "none";
  container.style.overflow = "visible";
  container.style.setProperty("--background", "#ffffff");
  container.style.setProperty("--foreground", "#0f172a");
  container.style.setProperty("--card", "#ffffff");
  container.style.setProperty("--card-foreground", "#0f172a");
  container.style.setProperty("--popover", "#f8fafc");
  container.style.setProperty("--popover-foreground", "#0f172a");
  container.style.setProperty("--primary", "#2563eb");
  container.style.setProperty("--primary-foreground", "#ffffff");
  container.style.setProperty("--secondary", "#f8fafc");
  container.style.setProperty("--secondary-foreground", "#334155");
  container.style.setProperty("--muted", "#f8fafc");
  container.style.setProperty("--muted-foreground", "#475569");
  container.style.setProperty("--accent", "#f8fafc");
  container.style.setProperty("--accent-foreground", "#0f172a");
  container.style.setProperty("--destructive", "#fecaca");
  container.style.setProperty("--destructive-foreground", "#991b1b");
  container.style.setProperty("--success", "#bbf7d0");
  container.style.setProperty("--success-foreground", "#14532d");
  container.style.setProperty("--warning", "#fef3c7");
  container.style.setProperty("--warning-foreground", "#92400e");
  container.style.setProperty("--border", "#cbd5e1");
  container.style.setProperty("--input", "#f8fafc");
  container.style.setProperty("--ring", "#bfdbfe");
  container.style.setProperty("--sidebar", "#ffffff");
  container.style.setProperty("--sidebar-foreground", "#0f172a");
  container.style.setProperty("--sidebar-border", "#cbd5e1");

  const styleElement = document.createElement("style");
  styleElement.textContent = `
    #pdf-renderer-container, #pdf-renderer-container * {
      color: #0f172a !important;
      background-color: transparent !important;
      border-color: #cbd5e1 !important;
      box-shadow: none !important;
    }
    #pdf-renderer-container th, #pdf-renderer-container td {
      border-bottom: 1px solid #e2e8f0 !important;
    }
    #pdf-renderer-container table {
      width: 100% !important;
      border-collapse: collapse !important;
    }
    #pdf-renderer-container .bg-white { background-color: #ffffff !important; }
    #pdf-renderer-container .bg-slate-50, #pdf-renderer-container .bg-slate-100 { background-color: #f8fafc !important; }
    #pdf-renderer-container .bg-blue-50 { background-color: #eff6ff !important; }
    #pdf-renderer-container .bg-blue-600 { background-color: #2563eb !important; }
    #pdf-renderer-container .text-blue-600 { color: #2563eb !important; }
    #pdf-renderer-container .text-slate-900 { color: #0f172a !important; }
    #pdf-renderer-container .text-slate-800 { color: #1e293b !important; }
    #pdf-renderer-container .text-slate-700 { color: #334155 !important; }
    #pdf-renderer-container .text-slate-600 { color: #475569 !important; }
    #pdf-renderer-container .text-slate-500 { color: #64748b !important; }
    #pdf-renderer-container .border { border-color: #cbd5e1 !important; }
    #pdf-renderer-container .border-slate-800, #pdf-renderer-container .border-slate-900 { border-color: #0f172a !important; }
    #pdf-renderer-container .border-slate-700 { border-color: #334155 !important; }
    #pdf-renderer-container .rounded-lg { border-radius: 0.5rem !important; }
    #pdf-renderer-container .rounded-2xl { border-radius: 1rem !important; }
    #pdf-renderer-container .rounded-full { border-radius: 9999px !important; }
    #pdf-renderer-container .text-right { text-align: right !important; }
    #pdf-renderer-container .text-center { text-align: center !important; }
    #pdf-renderer-container .text-left { text-align: left !important; }
    #pdf-renderer-container .flex { display: flex !important; }
    #pdf-renderer-container .grid { display: grid !important; }
    #pdf-renderer-container .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)) !important; }
    #pdf-renderer-container .lg\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
    #pdf-renderer-container .lg\\:flex-row { flex-direction: row !important; }
    #pdf-renderer-container .items-center { align-items: center !important; }
    #pdf-renderer-container .justify-between { justify-content: space-between !important; }
    #pdf-renderer-container .justify-end { justify-content: flex-end !important; }
    #pdf-renderer-container .font-bold { font-weight: 700 !important; }
    #pdf-renderer-container .font-medium { font-weight: 500 !important; }
    #pdf-renderer-container .text-3xl { font-size: 1.875rem !important; line-height: 2.25rem !important; }
    #pdf-renderer-container .text-2xl { font-size: 1.5rem !important; line-height: 2rem !important; }
    #pdf-renderer-container .text-sm { font-size: 0.875rem !important; line-height: 1.25rem !important; }
    #pdf-renderer-container .text-xs { font-size: 0.75rem !important; line-height: 1rem !important; }
    #pdf-renderer-container .p-4 { padding: 1rem !important; }
    #pdf-renderer-container .p-2 { padding: 0.5rem !important; }
    #pdf-renderer-container .p-3 { padding: 0.75rem !important; }
    #pdf-renderer-container .p-8 { padding: 2rem !important; }
    #pdf-renderer-container .pb-6 { padding-bottom: 1.5rem !important; }
    #pdf-renderer-container .pt-4 { padding-top: 1rem !important; }
    #pdf-renderer-container .mt-2 { margin-top: 0.5rem !important; }
    #pdf-renderer-container .mt-3 { margin-top: 0.75rem !important; }
    #pdf-renderer-container .mb-4 { margin-bottom: 1rem !important; }
    #pdf-renderer-container .mb-3 { margin-bottom: 0.75rem !important; }
    #pdf-renderer-container .space-y-1 > * + * { margin-top: 0.25rem !important; }
    #pdf-renderer-container .space-y-2 > * + * { margin-top: 0.5rem !important; }
    #pdf-renderer-container .space-y-4 > * + * { margin-top: 1rem !important; }
    #pdf-renderer-container .gap-4 { gap: 1rem !important; }
    #pdf-renderer-container .gap-6 { gap: 1.5rem !important; }
    #pdf-renderer-container .border-b { border-bottom-width: 1px !important; }
    #pdf-renderer-container .border-b-2 { border-bottom-width: 2px !important; }
    #pdf-renderer-container .border-t-2 { border-top-width: 2px !important; }
    #pdf-renderer-container .w-full { width: 100% !important; }
    #pdf-renderer-container .max-w-xs { max-width: 20rem !important; }
    #pdf-renderer-container .max-w-4xl { max-width: 56rem !important; }
    #pdf-renderer-container .overflow-x-auto { overflow-x: auto !important; }
    #pdf-renderer-container .hover\\:bg-slate-50:hover { background-color: #f8fafc !important; }
    #pdf-renderer-container .bg-slate-50 { background-color: #f8fafc !important; }
    #pdf-renderer-container .bg-slate-100 { background-color: #f1f5f9 !important; }
  `;
  container.appendChild(styleElement);
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(<InvoiceDocument invoice={invoice} />);

  // Wait for React to fully render and paint the component
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 500);
      });
    });
  });

  if ((document as any).fonts?.ready) {
    try {
      await (document as any).fonts.ready;
    } catch (e) {
      console.warn("Font loading not available, proceeding with rendering");
    }
  }

  try {
    const canvas = await html2canvas(container, {
      backgroundColor: "#ffffff",
      scale,
      useCORS: true,
      width: container.offsetWidth,
      height: container.offsetHeight,
      allowTaint: true,
      foreignObjectRendering: true,
      imageTimeout: 20000,
    });

    root.unmount();
    container.remove();
    return canvas;
  } catch (error) {
    root.unmount();
    container.remove();
    throw new Error(`Failed to render invoice to canvas: ${error instanceof Error ? error.message : String(error)}`);
  }
}
