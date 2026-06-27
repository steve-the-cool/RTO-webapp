import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Plus,
  TrendingUp,
  AlertCircle,
  Loader2,
  Edit2,
  BarChart3 as BarChartIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { getSession } from "@/lib/auth";
import {
  subscribeToTargets,
  updateTargetValue,
  updateCompletedCount,
  createOrInitializeTarget,
  type TargetCategory,
  type TargetMetrics,
} from "@/lib/targets";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export const Route = createFileRoute("/dashboard/targets")({
  component: TargetsPage,
});

const CATEGORIES: TargetCategory[] = [
  "Insurance",
  "Fitness",
  "Gujarat Permit",
  "National Permit",
  "Tax",
  "License New",
  "License Renew",
  "RC Transfer",
  "HP Addition",
  "HP Termination",
];

const CATEGORY_COLORS: Record<TargetCategory, string> = {
  Insurance: "#3b82f6",
  Fitness: "#10b981",
  "Gujarat Permit": "#8b5cf6",
  "National Permit": "#ec4899",
  Tax: "#06b6d4",
  "License New": "#6366f1",
  "License Renew": "#38bdf8",
  "RC Transfer": "#14b8a6",
  "HP Addition": "#f97316",
  "HP Termination": "#ef4444",
};

// ─── Main Page ────────────────────────────────────────────────────────────────

function TargetsPage() {
  const session = getSession();
  const [targets, setTargets] = useState<TargetMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTarget, setEditingTarget] = useState<TargetMetrics | null>(null);
  const [error, setError] = useState("");

  // Subscribe to targets
  useEffect(() => {
    setIsLoading(true);
    const unsub = subscribeToTargets((data) => {
      setTargets(data);
      setIsLoading(false);
    });
    return unsub;
  }, []);

  const isAdmin = session?.role === "admin";

  const handleAddNew = () => {
    setEditingTarget(null);
    setShowForm(true);
    setError("");
  };

  const handleEdit = (target: TargetMetrics) => {
    setEditingTarget(target);
    setShowForm(true);
    setError("");
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingTarget(null);
    setError("");
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Target Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor service targets and achievements across all categories
          </p>
        </div>
        {isAdmin && (
          <Button onClick={handleAddNew} className="gap-2">
            <Plus className="size-4" />
            Set Target
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Target Cards Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {targets.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                <BarChartIcon className="size-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No targets set yet</p>
                {isAdmin && (
                  <Button variant="outline" onClick={handleAddNew} className="mt-4">
                    Create First Target
                  </Button>
                )}
              </div>
            ) : (
              targets.map((target) => (
                <TargetCard
                  key={target.id}
                  target={target}
                  onEdit={isAdmin ? handleEdit : undefined}
                  onCompleteChange={
                    isAdmin ? (newValue) => updateCompletedInUI(target.id, newValue) : undefined
                  }
                />
              ))
            )}
          </div>

          {/* Charts Section */}
          {targets.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Achievement Bar Chart */}
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="size-4" />
                  Achievement Percentage
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={targets}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="category"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      interval={0}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      label={{ value: "Percentage (%)", angle: -90, position: "insideLeft" }}
                    />
                    <Tooltip
                      formatter={(value) =>
                        `${typeof value === "number" ? value.toFixed(2) : value}%`
                      }
                      contentStyle={{
                        backgroundColor: "rgba(0, 0, 0, 0.8)",
                        border: "none",
                        borderRadius: "8px",
                        color: "white",
                      }}
                    />
                    <Bar dataKey="achievementPercentage" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Progress Distribution Pie Chart */}
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-4">Completed vs Remaining</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={targets}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="category"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      interval={0}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis label={{ value: "Count", angle: -90, position: "insideLeft" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(0, 0, 0, 0.8)",
                        border: "none",
                        borderRadius: "8px",
                        color: "white",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="completed" stackId="a" fill="#10b981" />
                    <Bar dataKey="remaining" stackId="a" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Category Distribution Pie Chart */}
              <div className="rounded-lg border bg-card p-4 lg:col-span-2">
                <h3 className="font-semibold mb-4">Target Distribution</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={targets}
                      dataKey="target"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {targets.map((entry) => (
                        <Cell key={`cell-${entry.id}`} fill={CATEGORY_COLORS[entry.category]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) =>
                        `${typeof value === "number" ? Math.round(value as number) : value}`
                      }
                      contentStyle={{
                        backgroundColor: "rgba(0, 0, 0, 0.8)",
                        border: "none",
                        borderRadius: "8px",
                        color: "white",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      {/* Form Dialog */}
      <TargetFormDialog
        open={showForm}
        onOpenChange={handleFormClose}
        editingTarget={editingTarget}
        onSuccess={handleFormClose}
        onError={setError}
      />
    </div>
  );

  function updateCompletedInUI(targetId: string, newValue: number) {
    const session = getSession();
    if (!session) return;

    updateCompletedCount(targetId, newValue, session.username).catch((err) => {
      setError(`Failed to update: ${err.message}`);
    });
  }
}

// ─── Target Card Component ────────────────────────────────────────────────────

interface TargetCardProps {
  target: TargetMetrics;
  onEdit?: (target: TargetMetrics) => void;
  onCompleteChange?: (newValue: number) => void;
}

function TargetCard({ target, onEdit, onCompleteChange }: TargetCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newValue, setNewValue] = useState(String(target.completed));

  const handleSave = () => {
    const value = parseInt(newValue, 10);
    if (!isNaN(value) && value >= 0) {
      onCompleteChange?.(value);
      setIsEditing(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{target.category}</p>
          <h3 className="text-lg font-semibold mt-1">{target.target}</h3>
        </div>
        {onEdit && (
          <button
            onClick={() => onEdit(target)}
            className="p-1 hover:bg-muted rounded-md transition-colors"
          >
            <Edit2 className="size-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Metrics */}
      <div className="space-y-3">
        {/* Completed */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground">Completed</span>
            {isEditing ? (
              <div className="flex gap-1">
                <Input
                  type="number"
                  min="0"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="h-6 w-16 text-xs"
                />
                <button
                  onClick={handleSave}
                  className="px-2 py-0.5 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90"
                >
                  Save
                </button>
              </div>
            ) : (
              <span className="text-sm font-bold">{target.completed}</span>
            )}
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{
                width: `${Math.min(100, (target.completed / target.target) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Remaining */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Remaining</span>
          <span className="font-medium">{target.remaining}</span>
        </div>

        {/* Achievement */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Achievement</span>
          <span
            className={cn(
              "font-bold",
              target.achievementPercentage >= 100
                ? "text-green-600"
                : target.achievementPercentage >= 75
                  ? "text-blue-600"
                  : target.achievementPercentage >= 50
                    ? "text-amber-600"
                    : "text-red-600",
            )}
          >
            {target.achievementPercentage.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Target Form Dialog ────────────────────────────────────────────────────────

interface TargetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTarget: TargetMetrics | null;
  onSuccess: () => void;
  onError: (error: string) => void;
}

function TargetFormDialog({
  open,
  onOpenChange,
  editingTarget,
  onSuccess,
  onError,
}: TargetFormDialogProps) {
  const session = getSession();
  const [selectedCategory, setSelectedCategory] = useState<TargetCategory | "">(
    editingTarget?.category || "",
  );
  const [targetValue, setTargetValue] = useState(editingTarget ? String(editingTarget.target) : "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (editingTarget) {
      setSelectedCategory(editingTarget.category);
      setTargetValue(String(editingTarget.target));
    } else {
      setSelectedCategory("");
      setTargetValue("");
    }
    setLocalError("");
  }, [editingTarget, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    if (!selectedCategory) {
      setLocalError("Please select a category");
      return;
    }

    const value = parseInt(targetValue, 10);
    if (isNaN(value) || value <= 0) {
      setLocalError("Please enter a valid target value");
      return;
    }

    if (!session) {
      setLocalError("Not authenticated");
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingTarget) {
        await updateTargetValue(editingTarget.id, value, session.username);
      } else {
        await createOrInitializeTarget(selectedCategory as TargetCategory, value, session.username);
      }

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save target";
      setLocalError(message);
      onError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editingTarget ? "Edit Target" : "Set New Target"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {localError && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{localError}</AlertDescription>
            </Alert>
          )}

          {/* Category Selection */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={selectedCategory}
              onValueChange={(val) => setSelectedCategory(val as TargetCategory)}
              disabled={!!editingTarget}
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target Value */}
          <div className="space-y-2">
            <Label htmlFor="target">Target Value</Label>
            <Input
              id="target"
              type="number"
              min="1"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="e.g., 100"
              disabled={isSubmitting}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : editingTarget ? (
                "Update"
              ) : (
                "Create"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
