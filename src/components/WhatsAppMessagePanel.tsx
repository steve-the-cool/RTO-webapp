import { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { renderTemplate, templates } from "@/lib/whatsappTemplateEngine";

interface WhatsAppMessagePanelProps {
  mobile?: string;
  name?: string;
}

/**
 * Unified WhatsApp messaging UI.
 * Replaces the static button approach with a dropdown of message templates.
 */
export function WhatsAppMessagePanel({ mobile, name }: WhatsAppMessagePanelProps) {
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);

  const isDisabled = !mobile || !mobile.trim();

  const formatMobileNumber = (num: string): string => {
    const cleaned = num.replace(/\D/g, "");
    if (cleaned.startsWith("91")) return cleaned;
    if (cleaned.startsWith("0")) return "91" + cleaned.slice(1);
    return "91" + cleaned;
  };

  const openWhatsApp = (message: string) => {
    if (isDisabled) return;
    const formattedNumber = formatMobileNumber(mobile!);
    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${formattedNumber}?text=${encodedMessage}`;
    window.open(url, "_blank");
  };

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value;
    setSelectedKey(key);
    if (key === "Custom Message") {
      setCustomDialogOpen(true);
      return;
    }
    if (key && templates[key]) {
      const clientData = {
        clientName: name ?? "",
        mobileNumber: mobile ?? "",
        vehicleNumber: "",
        serviceName: undefined,
        dueDate: undefined,
        pendingAmount: undefined,
        invoiceNumber: undefined,
      };
      const message = renderTemplate(key, clientData);
      openWhatsApp(message);
    }
  };

  const handleSendCustom = async () => {
    if (!customMessage.trim()) return;
    setSending(true);
    try {
      openWhatsApp(customMessage);
      setCustomMessage("");
      setCustomDialogOpen(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold tracking-wide text-muted-foreground flex items-center gap-2">
          <MessageCircle className="size-4" /> WhatsApp Actions
        </Label>
        {isDisabled && <span className="text-xs text-red-600">Mobile number required</span>}
      </div>

      <select
        className="w-full border rounded p-2 text-sm"
        value={selectedKey}
        onChange={handleTemplateChange}
        disabled={isDisabled}
      >
        <option value="" disabled>
          Select Message Type
        </option>
        {Object.keys(templates).map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>

      <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Custom WhatsApp Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="custom-message" className="text-xs font-semibold">
                Message
              </Label>
              <Textarea
                id="custom-message"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Type your message here..."
                className="min-h-32 text-sm"
              />
              <p className="text-xs text-muted-foreground">{customMessage.length} characters</p>
            </div>
            {!isDisabled && (
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                Sending to: <span className="font-mono font-semibold">{mobile}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomDialogOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button
              onClick={handleSendCustom}
              disabled={sending || !customMessage.trim() || isDisabled}
            >
              {sending ? "Sending…" : "Send to WhatsApp"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
