import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getForceCapsSetting, setForceCapsSetting } from "@/lib/capitalize-settings";
import { getMigrationStatus } from "@/lib/migration";
import { ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";

interface Settings {
  officeName: string;
  branch: string;
  contact: string;
}

const KEY = "registry-settings";
const DEFAULTS: Settings = { officeName: "Registry Pro", branch: "Branch 042", contact: "" };

export const Route = createFileRoute("/dashboard/settings")({ component: SettingsPage });

function SettingsPage() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [forceCaps, setForceCapsState] = useState(false);
  const [saved, setSaved] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<{ unmigratedRecords: number } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setS({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
    setForceCapsState(getForceCapsSetting());
    
    // Load migration status
    getMigrationStatus()
      .then(status => setMigrationStatus({ unmigratedRecords: status.unmigratedRecords }))
      .catch(err => console.error("Error loading migration status:", err));
  }, []);

  const save = () => {
    localStorage.setItem(KEY, JSON.stringify(s));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleForceCaps = (enabled: boolean) => {
    setForceCapsSetting(enabled);
    setForceCapsState(enabled);
    // Dispatch event so other components can listen for setting changes
    window.dispatchEvent(new Event("force-caps-changed"));
  };

  const reset = () => {
    if (!confirm("Clear ALL local data (records, tasks, documents)?")) return;
    ["registry-clients", "registry-leads", "registry-applications", "registry-customers", "registry-tasks", "registry-documents"].forEach((k) => localStorage.removeItem(k));
    alert("Data cleared. Reload to reseed.");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Office details and local data management.</p>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="space-y-1.5">
          <Label>Office name</Label>
          <Input value={s.officeName} onChange={(e) => setS({ ...s, officeName: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Branch</Label>
          <Input value={s.branch} onChange={(e) => setS({ ...s, branch: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Contact phone</Label>
          <Input value={s.contact} onChange={(e) => setS({ ...s, contact: e.target.value })} placeholder="9876543210" />
        </div>
        <div className="flex items-center justify-between pt-3 border-t">
          <div className="space-y-0.5">
            <Label>Force capital letters</Label>
            <p className="text-xs text-muted-foreground">Automatically convert text inputs to uppercase</p>
          </div>
          <Switch checked={forceCaps} onCheckedChange={toggleForceCaps} />
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={save}>Save changes</Button>
          {saved && <span className="text-sm text-success">Saved.</span>}
        </div>
      </div>

      <div className="rounded-xl border border-destructive/30 bg-card p-6 space-y-3">
        <h3 className="font-semibold text-destructive">Danger zone</h3>
        <p className="text-sm text-muted-foreground">Permanently delete all locally stored records and tasks.</p>
        <Button variant="destructive" onClick={reset}>Clear all data</Button>
      </div>

      {migrationStatus && migrationStatus.unmigratedRecords > 0 && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-6 space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-3 flex-1">
              <div>
                <h3 className="font-semibold text-orange-700">Service Type Migration Required</h3>
                <p className="text-sm text-orange-600 mt-1">
                  {migrationStatus.unmigratedRecords} record(s) need to be migrated to support service module filtering.
                </p>
              </div>
              <Link to="/dashboard/settings/migration" className="inline-block">
                <Button variant="default" size="sm">
                  <ArrowRight className="size-4 mr-2" />
                  Go to Migration Tool
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {migrationStatus && migrationStatus.unmigratedRecords === 0 && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-6 space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-green-700">All Records Migrated</h3>
              <p className="text-sm text-green-600 mt-1">
                All records have been successfully migrated and are ready for service module filtering.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
