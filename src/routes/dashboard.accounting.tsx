// src/routes/dashboard.accounting.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  subscribeAndSyncFinance,
  subscribePaymentHistory,
  updateRecordCollectionDate,
  setBhaylubhaRequirement,
  approveRecordBhaylubha,
  recordPaymentEntry,
  type FinanceRecord,
  type PaymentHistoryItem,
} from "@/lib/financeService";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search,
  Calendar,
  CheckCircle,
  HelpCircle,
  Clock,
  Plus,
  Lock,
  MessageSquare,
  FileText,
  Filter,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Printer,
  ChevronDown,
  Trash2,
  Edit2,
} from "lucide-react";
import jsPDF from "jspdf";
import { subscribeToAllInvoices, type Invoice } from "@/lib/billing";
import { subscribeToRecords, type RegistryRecord } from "@/lib/records";
import { verifyAdminPin } from "@/lib/adminSecurity";
import { doc, deleteDoc, collection, query, where, getDocs, writeBatch, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const Route = createFileRoute("/dashboard/accounting")({
  component: AccountingDashboardPage,
});

function AccountingDashboardPage() {
  const [activeTab, setActiveTab] = useState<"collections" | "outstanding" | "payments">("collections");
  const [financeRecords, setFinanceRecords] = useState<FinanceRecord[]>([]);
  const [paymentEntries, setPaymentEntries] = useState<PaymentHistoryItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<RegistryRecord[]>([]);
  const [leads, setLeads] = useState<RegistryRecord[]>([]);
  const [customers, setCustomers] = useState<RegistryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("all");
  const [filterService, setFilterService] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMethod, setFilterMethod] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Modals & Forms state
  const [selectedRecord, setSelectedRecord] = useState<FinanceRecord | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentHistoryItem | null>(null);
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<any>("UPI");
  const [payAccount, setPayAccount] = useState<any>("ICICI Bank");
  const [payRemarks, setPayRemarks] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingPayment, setSavingPayment] = useState(false);

  // PIN verification states
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [paymentToDelete, setPaymentToDelete] = useState<PaymentHistoryItem | null>(null);

  // Approval state
  const [approvalRemarks, setApprovalRemarks] = useState("");
  const [approving, setApproving] = useState(false);

  const session = getSession();
  const userRole = session?.role || "employee";
  const username = session?.name || session?.username || "unknown";
  const isAdmin = userRole === "admin";
  const isStaff = userRole === "employee" || userRole === "viewer";

  // Subscriptions
  useEffect(() => {
    setLoading(true);
    const unsubFinance = subscribeAndSyncFinance((list) => {
      setFinanceRecords(list);
      setLoading(false);
    });
    const unsubPayments = subscribePaymentHistory((list) => {
      setPaymentEntries(list);
    });
    const unsubInvoices = subscribeToAllInvoices((list) => {
      setInvoices(list);
    });
    const unsubClients = subscribeToRecords("clients", setClients);
    const unsubLeads = subscribeToRecords("leads", setLeads);
    const unsubCustomers = subscribeToRecords("customers", setCustomers);

    return () => {
      unsubFinance();
      unsubPayments();
      unsubInvoices();
      unsubClients();
      unsubLeads();
      unsubCustomers();
    };
  }, []);

  // Maps for enrichment
  const invoicesMap = useMemo(() => {
    const map = new Map<string, Invoice>();
    invoices.forEach((inv) => map.set(inv.id, inv));
    return map;
  }, [invoices]);

  const clientDetailsMap = useMemo(() => {
    const map = new Map<string, { mobile: string; vehicleNo: string }>();
    const all = [...clients, ...leads, ...customers];
    all.forEach((c) => {
      map.set(c.id, {
        mobile: c.phone || c.mo || "",
        vehicleNo: c.mvNo || "",
      });
    });
    return map;
  }, [clients, leads, customers]);

  // Unique lists for filters
  const employees = useMemo(() => {
    const set = new Set<string>();
    financeRecords.forEach((r) => r.assignedEmployee && set.add(r.assignedEmployee));
    return Array.from(set);
  }, [financeRecords]);

  const servicesList = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((inv) => {
      inv.services?.forEach((s) => s.serviceName && set.add(s.serviceName));
    });
    return Array.from(set);
  }, [invoices]);

  // Main filters and search logic
  const filteredRecords = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return financeRecords.filter((r) => {
      const inv = invoicesMap.get(r.invoiceId);
      const cDetails = clientDetailsMap.get(r.clientId);

      // Search term (Client Name, Vehicle Number, Invoice Number, Mobile Number)
      const term = searchTerm.toLowerCase();
      const mobile = inv?.clientMobile || cDetails?.mobile || "";
      const vehicle = inv?.vehicleNumber || cDetails?.vehicleNo || "";
      const matchesSearch =
        searchTerm === "" ||
        r.clientName.toLowerCase().includes(term) ||
        r.invoiceNumber.toLowerCase().includes(term) ||
        mobile.includes(term) ||
        vehicle.toLowerCase().includes(term);

      if (!matchesSearch) return false;

      // Employee Filter
      if (filterEmployee !== "all" && r.assignedEmployee !== filterEmployee) return false;

      // Service Filter
      if (filterService !== "all") {
        const hasService = inv?.services?.some((s) => s.serviceName === filterService);
        if (!hasService) return false;
      }

      // Status Filter
      const isOverdue = r.paymentStatus !== "Paid" && r.collectionDate && r.collectionDate < todayStr;
      if (filterStatus !== "all") {
        if (filterStatus === "Overdue" && !isOverdue) return false;
        if (filterStatus === "Pending" && (r.paymentStatus !== "Pending" || isOverdue)) return false;
        if (filterStatus === "Partially Paid" && (r.paymentStatus !== "Partially Paid" || isOverdue)) return false;
        if (filterStatus === "Paid" && r.paymentStatus !== "Paid") return false;
      }

      // Date Range Filter
      if (filterStartDate && r.collectionDate && r.collectionDate < filterStartDate) return false;
      if (filterEndDate && r.collectionDate && r.collectionDate > filterEndDate) return false;

      return true;
    });
  }, [financeRecords, invoicesMap, clientDetailsMap, searchTerm, filterEmployee, filterService, filterStatus, filterStartDate, filterEndDate]);

  const filteredPayments = useMemo(() => {
    return paymentEntries.filter((p) => {
      const inv = invoicesMap.get(p.invoiceId);
      const r = financeRecords.find((rec) => rec.invoiceId === p.invoiceId);
      const cDetails = r ? clientDetailsMap.get(r.clientId) : null;

      // Search term
      const term = searchTerm.toLowerCase();
      const mobile = inv?.clientMobile || cDetails?.mobile || "";
      const vehicle = inv?.vehicleNumber || cDetails?.vehicleNo || "";
      const matchesSearch =
        searchTerm === "" ||
        (r?.clientName || "").toLowerCase().includes(term) ||
        p.invoiceId.toLowerCase().includes(term) ||
        (p as any).invoiceNumber?.toLowerCase().includes(term) ||
        mobile.includes(term) ||
        vehicle.toLowerCase().includes(term) ||
        p.receivedBy.toLowerCase().includes(term) ||
        p.remarks.toLowerCase().includes(term);

      if (!matchesSearch) return false;

      // Employee Filter
      if (filterEmployee !== "all" && r?.assignedEmployee !== filterEmployee) return false;

      // Service Filter
      if (filterService !== "all") {
        const hasService = inv?.services?.some((s) => s.serviceName === filterService);
        if (!hasService) return false;
      }

      // Method Filter
      if (filterMethod !== "all" && p.method !== filterMethod) return false;

      // Date Range Filter
      const pDate = p.receivedAt?.slice(0, 10);
      if (filterStartDate && pDate && pDate < filterStartDate) return false;
      if (filterEndDate && pDate && pDate > filterEndDate) return false;

      return true;
    });
  }, [paymentEntries, invoicesMap, financeRecords, clientDetailsMap, searchTerm, filterEmployee, filterService, filterMethod, filterStartDate, filterEndDate]);

  // Metrics computation
  const metrics = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const totalReceivable = financeRecords.reduce((sum, r) => sum + r.invoiceAmount, 0);
    const totalReceived = financeRecords.reduce((sum, r) => sum + r.receivedAmount, 0);
    const outstandingAmount = financeRecords.reduce((sum, r) => sum + r.balanceAmount, 0);

    const todayCollections = financeRecords
      .filter((r) => r.collectionDate === todayStr && r.balanceAmount > 0)
      .reduce((sum, r) => sum + r.balanceAmount, 0);

    const overdueCollections = financeRecords
      .filter((r) => r.collectionDate && r.collectionDate < todayStr && r.balanceAmount > 0)
      .reduce((sum, r) => sum + r.balanceAmount, 0);

    return {
      totalReceivable,
      totalReceived,
      outstandingAmount,
      todayCollections,
      overdueCollections,
    };
  }, [financeRecords]);

  // Actions
  const handleUpdateDate = async (recordId: string, date: string) => {
    try {
      await updateRecordCollectionDate(recordId, date, username);
      toast.success("Collection date updated!");
    } catch (e: any) {
      toast.error(e.message || "Failed to update date");
    }
  };

  const handleToggleBhaylubhaFlag = async (recordId: string, required: boolean) => {
    if (isStaff) {
      return toast.error("Access Denied: Staff cannot modify finance settings.");
    }
    try {
      await setBhaylubhaRequirement(recordId, required, username);
      toast.success(required ? "Approval required enabled" : "Approval requirement cleared");
    } catch (e: any) {
      toast.error(e.message || "Failed to toggle approval requirement");
    }
  };

  const handleApprove = async () => {
    if (!selectedRecord) return;
    if (!isAdmin) {
      return toast.error("Access Denied: Only Admins can grant approvals.");
    }
    setApproving(true);
    try {
      await approveRecordBhaylubha(selectedRecord.id, username, approvalRemarks);
      toast.success("Bhaylubha approval granted!");
      setApprovalRemarks("");
      setSelectedRecord(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to approve record");
    } finally {
      setApproving(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;
    if (isStaff) {
      return toast.error("Access Denied: Staff cannot record payments.");
    }

    const amt = Number(payAmount);
    if (!payAmount || isNaN(amt) || amt <= 0) {
      return toast.error("Enter a valid payment amount");
    }

    setSavingPayment(true);
    try {
      await recordPaymentEntry(selectedRecord.id, {
        amount: amt,
        method: payMethod,
        accountName: payAccount,
        remarks: payRemarks,
        receivedBy: username,
        paymentDate: payDate,
      });
      toast.success("Payment recorded successfully!");
      setPayAmount("");
      setPayRemarks("");
      setSelectedRecord(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to record payment");
    } finally {
      setSavingPayment(false);
    }
  };

  const handleEditPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayment) return;
    if (isStaff) return toast.error("Access Denied: Staff cannot edit payments.");

    const amt = Number(payAmount);
    if (!payAmount || isNaN(amt) || amt <= 0) return toast.error("Enter a valid payment amount");

    setSavingPayment(true);
    try {
      // Direct Firestore update to keep things clean
      const paymentRef = doc(db, "payment_history", selectedPayment.id!);
      const financeRef = doc(db, "finance_records", selectedPayment.financeRecordId);
      const invoiceRef = doc(db, "billing_invoices", selectedPayment.invoiceId);

      const fSnap = await getDoc(financeRef);
      if (!fSnap.exists()) throw new Error("Finance record not found");
      const fData = fSnap.data() as FinanceRecord;

      const diff = amt - selectedPayment.amount;
      const newReceived = fData.receivedAmount + diff;
      const newBalance = fData.invoiceAmount - newReceived;

      if (newBalance < 0) {
        throw new Error(`Updated amount exceeds invoice balance.`);
      }

      const newStatus = newBalance === 0 ? "Paid" : newReceived > 0 ? "Partially Paid" : "Pending";

      const batch = writeBatch(db);
      batch.update(paymentRef, {
        amount: amt,
        method: payMethod,
        accountName: payAccount,
        remarks: payRemarks,
      });

      batch.update(financeRef, {
        receivedAmount: newReceived,
        balanceAmount: newBalance,
        paymentStatus: newStatus,
        paymentMethod: payMethod,
        accountName: payAccount,
        remarks: payRemarks,
        updatedAt: new Date().toISOString(),
      });

      batch.update(invoiceRef, {
        status: newStatus,
        totalPaid: newReceived,
      });

      await batch.commit();
      toast.success("Payment updated successfully!");
      setSelectedPayment(null);
      setIsEditingPayment(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to edit payment");
    } finally {
      setSavingPayment(false);
    }
  };

  const startDeletePayment = (payment: PaymentHistoryItem) => {
    if (!isAdmin) return toast.error("Access Denied: Only Admin can delete payments.");
    setPaymentToDelete(payment);
    setPinDialogOpen(true);
  };

  const handleDeletePaymentVerified = async () => {
    if (!paymentToDelete) return;
    const ok = await verifyAdminPin(adminPin);
    if (!ok) {
      toast.error("Invalid Admin PIN");
      return;
    }

    try {
      const paymentRef = doc(db, "payment_history", paymentToDelete.id!);
      const financeRef = doc(db, "finance_records", paymentToDelete.financeRecordId);
      const invoiceRef = doc(db, "billing_invoices", paymentToDelete.invoiceId);

      const fSnap = await getDoc(financeRef);
      if (!fSnap.exists()) throw new Error("Finance record not found");
      const fData = fSnap.data() as FinanceRecord;

      const newReceived = Math.max(0, fData.receivedAmount - paymentToDelete.amount);
      const newBalance = fData.invoiceAmount - newReceived;
      const newStatus = newBalance === 0 ? "Paid" : newReceived > 0 ? "Partially Paid" : "Pending";

      const batch = writeBatch(db);
      batch.delete(paymentRef);
      batch.update(financeRef, {
        receivedAmount: newReceived,
        balanceAmount: newBalance,
        paymentStatus: newStatus,
        updatedAt: new Date().toISOString(),
      });
      batch.update(invoiceRef, {
        status: newStatus,
        totalPaid: newReceived,
      });

      await batch.commit();
      toast.success("Payment deleted successfully!");
      setPinDialogOpen(false);
      setAdminPin("");
      setPaymentToDelete(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete payment");
    }
  };

  const sendWhatsAppReminder = (mobile: string, name: string, invoiceNo: string, amount: number) => {
    if (!mobile) {
      toast.error("No mobile number available for this client.");
      return;
    }
    const formattedNumber = mobile.replace(/[^0-9]/g, "");
    const text = `Hi ${name}, this is a friendly reminder regarding your outstanding invoice ${invoiceNo} for the amount of ₹${amount.toLocaleString("en-IN")}. Please arrange for payment. Thank you!`;
    const encodedText = encodeURIComponent(text);
    window.open(`https://wa.me/${formattedNumber.startsWith("91") ? "" : "91"}${formattedNumber}?text=${encodedText}`, "_blank");
  };

  // PDF Generators
  const generateSummaryPDF = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Accounting Summary Statement", 14, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Date Generated: ${new Date().toLocaleString("en-IN")}`, 14, 26);

    const values = [
      ["Total Receivable", `INR ${metrics.totalReceivable.toLocaleString("en-IN")}`],
      ["Total Received", `INR ${metrics.totalReceived.toLocaleString("en-IN")}`],
      ["Outstanding Amount", `INR ${metrics.outstandingAmount.toLocaleString("en-IN")}`],
      ["Today's Collections", `INR ${metrics.todayCollections.toLocaleString("en-IN")}`],
      ["Overdue Collections", `INR ${metrics.overdueCollections.toLocaleString("en-IN")}`],
    ];

    let y = 40;
    values.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(label, 14, y);
      doc.setFont("helvetica", "normal");
      doc.text(value, 120, y);
      y += 10;
    });

    doc.save("ACCOUNTING_SUMMARY.pdf");
  };

  const generateCollectionsPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Scheduled Collections Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, 14, 26);

    let y = 40;
    doc.setFont("helvetica", "bold");
    doc.text("Client Name", 14, y);
    doc.text("Invoice No", 70, y);
    doc.text("Date", 110, y);
    doc.text("Amount", 150, y);
    doc.text("Balance", 180, y);
    doc.line(14, y + 2, 196, y + 2);
    y += 10;

    doc.setFont("helvetica", "normal");
    filteredRecords.forEach((r) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(r.clientName.slice(0, 24), 14, y);
      doc.text(r.invoiceNumber, 70, y);
      doc.text(r.collectionDate || "—", 110, y);
      doc.text(r.invoiceAmount.toLocaleString("en-IN"), 150, y);
      doc.text(r.balanceAmount.toLocaleString("en-IN"), 180, y);
      y += 8;
    });

    doc.save("COLLECTIONS_REPORT.pdf");
  };

  const generateOutstandingPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Outstanding Payments Statement", 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, 14, 26);

    let y = 40;
    doc.setFont("helvetica", "bold");
    doc.text("Client Name", 14, y);
    doc.text("Invoice", 70, y);
    doc.text("Due Date", 110, y);
    doc.text("Paid", 150, y);
    doc.text("Outstanding", 180, y);
    doc.line(14, y + 2, 196, y + 2);
    y += 10;

    doc.setFont("helvetica", "normal");
    filteredRecords.filter(r => r.balanceAmount > 0).forEach((r) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(r.clientName.slice(0, 24), 14, y);
      doc.text(r.invoiceNumber, 70, y);
      doc.text(r.collectionDate || "—", 110, y);
      doc.text(r.receivedAmount.toLocaleString("en-IN"), 150, y);
      doc.text(r.balanceAmount.toLocaleString("en-IN"), 180, y);
      y += 8;
    });

    doc.save("OUTSTANDING_PAYMENTS.pdf");
  };

  const generatePaymentsPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Payment Entries Logs", 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, 14, 26);

    let y = 40;
    doc.setFont("helvetica", "bold");
    doc.text("Date", 14, y);
    doc.text("Invoice No", 40, y);
    doc.text("Amount", 80, y);
    doc.text("Method", 110, y);
    doc.text("Account", 140, y);
    doc.text("Received By", 170, y);
    doc.line(14, y + 2, 196, y + 2);
    y += 10;

    doc.setFont("helvetica", "normal");
    filteredPayments.forEach((p) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(p.receivedAt?.slice(0, 10) || "—", 14, y);
      doc.text(p.invoiceId?.slice(0, 12) || "—", 40, y);
      doc.text(p.amount.toLocaleString("en-IN"), 80, y);
      doc.text(p.method || "—", 110, y);
      doc.text(p.accountName || "—", 140, y);
      doc.text((p.receivedBy || "").slice(0, 10), 170, y);
      y += 8;
    });

    doc.save("PAYMENT_ENTRIES.pdf");
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Accounting Dashboard
          </h2>
          <p className="text-muted-foreground text-sm">
            Unified billing tracking, payment log entry management, and collection scheduling.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={generateSummaryPDF} className="text-xs bg-slate-50 border-slate-200">
            <FileText className="size-4 mr-1 text-red-600" /> Export Summary PDF
          </Button>
          <Button variant="outline" size="sm" onClick={generateCollectionsPDF} className="text-xs bg-slate-50 border-slate-200">
            <FileText className="size-4 mr-1 text-red-600" /> Export Collections PDF
          </Button>
          <Button variant="outline" size="sm" onClick={generateOutstandingPDF} className="text-xs bg-slate-50 border-slate-200">
            <FileText className="size-4 mr-1 text-red-600" /> Export Outstanding PDF
          </Button>
          <Button variant="outline" size="sm" onClick={generatePaymentsPDF} className="text-xs bg-slate-50 border-slate-200">
            <FileText className="size-4 mr-1 text-red-600" /> Export Payments PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border border-slate-100 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Total Receivable</p>
              <h3 className="text-xl font-bold mt-1 text-blue-600">₹{metrics.totalReceivable.toLocaleString("en-IN")}</h3>
            </div>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <DollarSign className="size-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-100 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Total Received</p>
              <h3 className="text-xl font-bold mt-1 text-green-600">₹{metrics.totalReceived.toLocaleString("en-IN")}</h3>
            </div>
            <div className="p-2 bg-green-50 text-green-600 rounded-lg">
              <CheckCircle className="size-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-100 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Outstanding Amount</p>
              <h3 className="text-xl font-bold mt-1 text-rose-600">₹{metrics.outstandingAmount.toLocaleString("en-IN")}</h3>
            </div>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <TrendingUp className="size-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-100 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Today's Collections</p>
              <h3 className="text-xl font-bold mt-1 text-amber-600">₹{metrics.todayCollections.toLocaleString("en-IN")}</h3>
            </div>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Calendar className="size-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-100 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Overdue Collections</p>
              <h3 className="text-xl font-bold mt-1 text-red-600">₹{metrics.overdueCollections.toLocaleString("en-IN")}</h3>
            </div>
            <div className="p-2 bg-red-50 text-red-600 rounded-lg">
              <AlertCircle className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Shared Filters Panel */}
      <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search Client Name, Vehicle, Invoice, Mobile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 bg-white py-1.5 text-xs h-9"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center w-full md:w-auto">
            <div className="flex items-center gap-1 text-xs">
              <Filter className="size-3.5 text-slate-500" />
              <span className="font-bold text-slate-500 uppercase mr-1">Employee:</span>
              <select
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="py-1.5 px-2.5 border rounded-md bg-white text-gray-700 font-semibold"
              >
                <option value="all">All</option>
                {employees.map((emp) => (
                  <option key={emp} value={emp}>{emp}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 text-xs">
              <span className="font-bold text-slate-500 uppercase mr-1">Service:</span>
              <select
                value={filterService}
                onChange={(e) => setFilterService(e.target.value)}
                className="py-1.5 px-2.5 border rounded-md bg-white text-gray-700 font-semibold max-w-[150px]"
              >
                <option value="all">All</option>
                {servicesList.map((srv) => (
                  <option key={srv} value={srv}>{srv}</option>
                ))}
              </select>
            </div>

            {activeTab !== "payments" && (
              <div className="flex items-center gap-1 text-xs">
                <span className="font-bold text-slate-500 uppercase mr-1">Status:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="py-1.5 px-2.5 border rounded-md bg-white text-gray-700 font-semibold"
                >
                  <option value="all">All</option>
                  <option value="Pending">Pending</option>
                  <option value="Partially Paid">Partially Paid</option>
                  <option value="Paid">Paid</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </div>
            )}

            {activeTab === "payments" && (
              <div className="flex items-center gap-1 text-xs">
                <span className="font-bold text-slate-500 uppercase mr-1">Method:</span>
                <select
                  value={filterMethod}
                  onChange={(e) => setFilterMethod(e.target.value)}
                  className="py-1.5 px-2.5 border rounded-md bg-white text-gray-700 font-semibold"
                >
                  <option value="all">All</option>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Online">Online</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 items-center border-t pt-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-slate-500 uppercase">Start Date:</span>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="py-1 px-2 border rounded bg-white text-slate-700 font-mono"
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-slate-500 uppercase">End Date:</span>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="py-1 px-2 border rounded bg-white text-slate-700 font-mono"
            />
          </div>
          {(filterStartDate || filterEndDate || filterEmployee !== "all" || filterService !== "all" || filterStatus !== "all" || filterMethod !== "all" || searchTerm !== "") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setFilterEmployee("all");
                setFilterService("all");
                setFilterStatus("all");
                setFilterMethod("all");
                setFilterStartDate("");
                setFilterEndDate("");
              }}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold"
            >
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab("collections")}
            className={`py-2.5 px-6 font-bold text-sm border-b-2 transition ${
              activeTab === "collections"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Collections
          </button>
          <button
            onClick={() => setActiveTab("outstanding")}
            className={`py-2.5 px-6 font-bold text-sm border-b-2 transition ${
              activeTab === "outstanding"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Outstanding Payments
          </button>
          <button
            onClick={() => setActiveTab("payments")}
            className={`py-2.5 px-6 font-bold text-sm border-b-2 transition ${
              activeTab === "payments"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Payment Entries
          </button>
        </div>

        {/* Tab 1: Collections */}
        {activeTab === "collections" && (
          <Card className="shadow-sm border border-slate-100">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground text-sm">
                  No collection records found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b bg-slate-50 uppercase text-[9px] font-bold text-muted-foreground">
                        <th className="p-3">Client</th>
                        <th className="p-3">Invoice Number</th>
                        <th className="p-3">Service</th>
                        <th className="p-3">Collection Date</th>
                        <th className="p-3 text-right">Invoice Amount</th>
                        <th className="p-3 text-right">Received Amount</th>
                        <th className="p-3 text-right">Balance</th>
                        <th className="p-3">Assigned Employee</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Bhaylubha</th>
                        <th className="p-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-gray-700">
                      {filteredRecords.map((r) => {
                        const inv = invoicesMap.get(r.invoiceId);
                        const cDetails = clientDetailsMap.get(r.clientId);
                        const serviceNames = inv?.services?.map((s) => s.serviceName).join(", ") || "—";
                        const mobile = inv?.clientMobile || cDetails?.mobile || "";

                        return (
                          <tr key={r.id} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-semibold text-gray-900">{r.clientName}</td>
                            <td className="p-3 font-mono">{r.invoiceNumber}</td>
                            <td className="p-3 max-w-[150px] truncate" title={serviceNames}>{serviceNames}</td>
                            <td className="p-3">
                              <input
                                type="date"
                                value={r.collectionDate || ""}
                                onChange={(e) => handleUpdateDate(r.id, e.target.value)}
                                disabled={isStaff}
                                className="bg-white border rounded p-1 text-[11px] font-mono focus:ring-1 focus:ring-primary w-28 disabled:bg-slate-50"
                              />
                            </td>
                            <td className="p-3 text-right font-mono">₹{r.invoiceAmount.toLocaleString("en-IN")}</td>
                            <td className="p-3 text-right font-mono text-emerald-600">₹{r.receivedAmount.toLocaleString("en-IN")}</td>
                            <td className="p-3 text-right font-mono font-bold text-rose-600">₹{r.balanceAmount.toLocaleString("en-IN")}</td>
                            <td className="p-3 text-slate-600">{r.assignedEmployee || "—"}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                r.paymentStatus === "Paid"
                                  ? "bg-green-100 text-green-800"
                                  : r.paymentStatus === "Partially Paid"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-orange-100 text-orange-800"
                              }`}>
                                {r.paymentStatus}
                              </span>
                            </td>
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={r.askBhaylubha}
                                onChange={(e) => handleToggleBhaylubhaFlag(r.id, e.target.checked)}
                                disabled={isStaff}
                                className="size-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                              />
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSelectedRecord(r)}
                                  className="text-indigo-600 hover:text-indigo-900 text-xs px-2 py-1 h-auto"
                                >
                                  Record Payment
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => sendWhatsAppReminder(mobile, r.clientName, r.invoiceNumber, r.balanceAmount)}
                                  className="text-emerald-600 hover:text-emerald-900 text-xs px-2 py-1 h-auto"
                                >
                                  WhatsApp
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tab 2: Outstanding Payments */}
        {activeTab === "outstanding" && (
          <Card className="shadow-sm border border-slate-100">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredRecords.filter(r => r.balanceAmount > 0).length === 0 ? (
                <div className="text-center py-20 text-muted-foreground text-sm">
                  No outstanding payment records found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b bg-slate-50 uppercase text-[9px] font-bold text-muted-foreground">
                        <th className="p-3">Client</th>
                        <th className="p-3">Invoice</th>
                        <th className="p-3">Service</th>
                        <th className="p-3 text-right">Invoice Amount</th>
                        <th className="p-3 text-right">Paid</th>
                        <th className="p-3 text-right">Outstanding</th>
                        <th className="p-3">Due Date</th>
                        <th className="p-3">Days Overdue</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-gray-700">
                      {filteredRecords.filter(r => r.balanceAmount > 0).map((r) => {
                        const inv = invoicesMap.get(r.invoiceId);
                        const cDetails = clientDetailsMap.get(r.clientId);
                        const serviceNames = inv?.services?.map((s) => s.serviceName).join(", ") || "—";
                        const mobile = inv?.clientMobile || cDetails?.mobile || "";

                        let daysOverdue = 0;
                        if (r.collectionDate) {
                          const due = new Date(r.collectionDate);
                          const today = new Date();
                          today.setHours(0,0,0,0);
                          due.setHours(0,0,0,0);
                          if (today.getTime() > due.getTime()) {
                            daysOverdue = Math.ceil((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
                          }
                        }

                        return (
                          <tr key={r.id} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-semibold text-gray-900">{r.clientName}</td>
                            <td className="p-3 font-mono">{r.invoiceNumber}</td>
                            <td className="p-3 max-w-[150px] truncate" title={serviceNames}>{serviceNames}</td>
                            <td className="p-3 text-right font-mono">₹{r.invoiceAmount.toLocaleString("en-IN")}</td>
                            <td className="p-3 text-right font-mono text-emerald-600">₹{r.receivedAmount.toLocaleString("en-IN")}</td>
                            <td className="p-3 text-right font-mono font-bold text-rose-600">₹{r.balanceAmount.toLocaleString("en-IN")}</td>
                            <td className="p-3 font-mono">{r.collectionDate || "—"}</td>
                            <td className="p-3 text-red-600 font-bold">{daysOverdue > 0 ? `${daysOverdue} Days` : "—"}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                daysOverdue > 0 ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-800"
                              }`}>
                                {daysOverdue > 0 ? "Overdue" : "Outstanding"}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSelectedRecord(r)}
                                  className="text-indigo-600 hover:text-indigo-900 text-xs px-2 py-1 h-auto"
                                >
                                  Record Payment
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => sendWhatsAppReminder(mobile, r.clientName, r.invoiceNumber, r.balanceAmount)}
                                  className="text-emerald-600 hover:text-emerald-900 text-xs px-2 py-1 h-auto"
                                >
                                  WhatsApp
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tab 3: Payment Entries */}
        {activeTab === "payments" && (
          <Card className="shadow-sm border border-slate-100">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredPayments.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground text-sm">
                  No payment history found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b bg-slate-50 uppercase text-[9px] font-bold text-muted-foreground">
                        <th className="p-3">Payment Date</th>
                        <th className="p-3">Client</th>
                        <th className="p-3">Invoice Number</th>
                        <th className="p-3">Service</th>
                        <th className="p-3 text-right">Amount</th>
                        <th className="p-3">Method</th>
                        <th className="p-3">Received In Account</th>
                        <th className="p-3">Received By</th>
                        <th className="p-3">Remarks</th>
                        <th className="p-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-gray-700">
                      {filteredPayments.map((p) => {
                        const inv = invoicesMap.get(p.invoiceId);
                        const r = financeRecords.find((rec) => rec.invoiceId === p.invoiceId);
                        const serviceNames = inv?.services?.map((s) => s.serviceName).join(", ") || "—";

                        return (
                          <tr key={p.id} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-mono">{p.receivedAt?.slice(0, 10) || "—"}</td>
                            <td className="p-3 font-semibold text-gray-900">{r?.clientName || "—"}</td>
                            <td className="p-3 font-mono">#{p.invoiceId?.slice(-6).toUpperCase()}</td>
                            <td className="p-3 max-w-[150px] truncate" title={serviceNames}>{serviceNames}</td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-600">₹{p.amount.toLocaleString("en-IN")}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-800">
                                {p.method}
                              </span>
                            </td>
                            <td className="p-3 text-slate-700">{p.accountName}</td>
                            <td className="p-3 text-slate-700">{p.receivedBy}</td>
                            <td className="p-3 italic text-muted-foreground truncate max-w-[150px]" title={p.remarks}>{p.remarks || "—"}</td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedPayment(p);
                                    setPayAmount(String(p.amount));
                                    setPayMethod(p.method);
                                    setPayAccount(p.accountName);
                                    setPayRemarks(p.remarks || "");
                                    setIsEditingPayment(true);
                                  }}
                                  disabled={isStaff}
                                  className="text-indigo-600 hover:text-indigo-900 text-xs px-2 py-1 h-auto"
                                >
                                  <Edit2 className="size-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startDeletePayment(p)}
                                  disabled={isStaff}
                                  className="text-red-600 hover:text-red-900 text-xs px-2 py-1 h-auto"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Record Payment Dialog */}
      {selectedRecord && (
        <Dialog open={!!selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-gray-800">
                Manage Collection — {selectedRecord.invoiceNumber}
              </DialogTitle>
              <CardDescription>
                Client: {selectedRecord.clientName} | Pending: ₹{selectedRecord.balanceAmount.toLocaleString("en-IN")}
              </CardDescription>
            </DialogHeader>

            <div className="grid gap-6 md:grid-cols-2 mt-2">
              <div className="space-y-4 border-r pr-4">
                <h3 className="text-xs font-bold uppercase text-gray-500 border-b pb-1">
                  Record Received Payment
                </h3>
                {selectedRecord.paymentStatus === "Paid" ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs font-medium">
                    Invoice is fully Paid.
                  </div>
                ) : (
                  <form onSubmit={handleRecordPayment} className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-gray-500">Amount Received (₹) *</Label>
                      <Input
                        type="number"
                        placeholder="e.g. 5000"
                        required
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        className="bg-white text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-gray-500">Payment Mode</Label>
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as any)}
                        className="w-full text-xs border rounded-md p-2 bg-white"
                      >
                        <option value="UPI">UPI</option>
                        <option value="Cash">Cash</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Cheque">Cheque</option>
                        <option value="Online">Online</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-gray-500">Deposit Account</Label>
                      <select
                        value={payAccount}
                        onChange={(e) => setPayAccount(e.target.value as any)}
                        className="w-full text-xs border rounded-md p-2 bg-white"
                      >
                        <option value="Cash Account">Cash Account</option>
                        <option value="ICICI Bank">ICICI Bank</option>
                        <option value="HDFC Bank">HDFC Bank</option>
                        <option value="Axis Bank">Axis Bank</option>
                        <option value="SBI">SBI</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-gray-500">Payment Date</Label>
                      <Input
                        type="date"
                        required
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                        className="bg-white text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-gray-500">Remarks</Label>
                      <Input
                        placeholder="Txn ID, memo details..."
                        value={payRemarks}
                        onChange={(e) => setPayRemarks(e.target.value)}
                        className="bg-white text-xs"
                      />
                    </div>
                    <Button type="submit" disabled={savingPayment} className="w-full text-xs py-1 h-auto mt-2">
                      {savingPayment ? "Recording..." : "Add Payment"}
                    </Button>
                  </form>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase text-gray-500 border-b pb-1">
                  Bhaylubha Approval Log
                </h3>
                {selectedRecord.askBhaylubha ? (
                  <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg text-xs space-y-2">
                    <p className="font-semibold text-amber-800 flex items-center gap-1.5">
                      <HelpCircle className="size-4 animate-bounce" /> Bhaylubha Approval Required
                    </p>
                    <p className="text-[10px] text-amber-700">
                      Settlement is locked until approval is granted.
                    </p>
                    {isAdmin ? (
                      <div className="pt-2 space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-gray-500">Approval Remarks</Label>
                        <Input
                          placeholder="Add approval comment..."
                          value={approvalRemarks}
                          onChange={(e) => setApprovalRemarks(e.target.value)}
                          className="bg-white text-xs"
                        />
                        <Button
                          onClick={handleApprove}
                          disabled={approving}
                          className="w-full text-xs bg-amber-600 hover:bg-amber-700 text-white py-1 h-auto"
                        >
                          {approving ? "Approving..." : "Grant Approval"}
                        </Button>
                      </div>
                    ) : (
                      <p className="text-[10px] text-red-600 font-bold bg-red-50 p-1.5 rounded">
                        Only Admins can approve.
                      </p>
                    )}
                  </div>
                ) : selectedRecord.approvedBy ? (
                  <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg text-xs space-y-1">
                    <p className="font-semibold text-emerald-800 flex items-center gap-1">
                      <CheckCircle className="size-4" /> Approval Granted
                    </p>
                    <div className="text-[10px] text-gray-600 space-y-0.5">
                      <p><strong>Approved By:</strong> {selectedRecord.approvedBy}</p>
                      <p><strong>Approved Date:</strong> {selectedRecord.approvedAt}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-2">
                    No approval required for this collection.
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="mt-4 pt-2 border-t">
              <Button variant="outline" onClick={() => setSelectedRecord(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Payment Dialog */}
      {isEditingPayment && selectedPayment && (
        <Dialog open={isEditingPayment} onOpenChange={(open) => !open && setIsEditingPayment(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-gray-800">
                Edit Payment Entry
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditPayment} className="space-y-3 mt-2">
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase text-gray-500">Amount Received (₹) *</Label>
                <Input
                  type="number"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="bg-white text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase text-gray-500">Payment Mode</Label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as any)}
                  className="w-full text-xs border rounded-md p-2 bg-white"
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Online">Online</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase text-gray-500">Deposit Account</Label>
                <select
                  value={payAccount}
                  onChange={(e) => setPayAccount(e.target.value as any)}
                  className="w-full text-xs border rounded-md p-2 bg-white"
                >
                  <option value="Cash Account">Cash Account</option>
                  <option value="ICICI Bank">ICICI Bank</option>
                  <option value="HDFC Bank">HDFC Bank</option>
                  <option value="Axis Bank">Axis Bank</option>
                  <option value="SBI">SBI</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase text-gray-500">Remarks</Label>
                <Input
                  value={payRemarks}
                  onChange={(e) => setPayRemarks(e.target.value)}
                  className="bg-white text-xs"
                />
              </div>
              <DialogFooter className="pt-3 border-t flex gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditingPayment(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={savingPayment}>
                  {savingPayment ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Admin PIN Dialog for Deletion */}
      {pinDialogOpen && (
        <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold text-gray-800">
                Admin Action Required
              </DialogTitle>
              <CardDescription>
                Please enter the Admin PIN to authorize the deletion of this payment.
              </CardDescription>
            </DialogHeader>
            <div className="space-y-3 py-3">
              <Label className="text-[10px] font-bold uppercase text-gray-500">Admin PIN</Label>
              <Input
                type="password"
                placeholder="••••"
                maxLength={4}
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                className="bg-white font-mono text-center text-lg tracking-widest"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPinDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeletePaymentVerified}>
                Authorize & Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
