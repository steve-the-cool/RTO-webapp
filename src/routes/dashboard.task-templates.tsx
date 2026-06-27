import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  FileText,
  Plus,
  Trash2,
  Edit,
  Save,
  X,
  GripVertical,
  CheckCircle,
  AlertCircle,
  ShieldAlert,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  subscribeToTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type TaskTemplate,
} from "@/lib/tasks";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/task-templates")({
  component: TaskTemplatesPage,
});

function TaskTemplatesPage() {
  const [session] = useState(() => getSession());
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [description, setDescription] = useState("");
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState("");

  const isAdmin = session?.role === "admin";
  const actor = session?.name || session?.username || "system";

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToTemplates((data) => {
      setTemplates(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleOpenCreate = () => {
    if (!isAdmin) return toast.error("Only admins can manage templates.");
    setEditingTemplate(null);
    setTemplateName("");
    setDescription("");
    setSubtasks([]);
    setNewSubtask("");
    setDialogOpen(true);
  };

  const handleOpenEdit = (tpl: TaskTemplate) => {
    if (!isAdmin) return toast.error("Only admins can manage templates.");
    setEditingTemplate(tpl);
    setTemplateName(tpl.templateName);
    setDescription(tpl.description || "");
    setSubtasks(tpl.subtasks || []);
    setNewSubtask("");
    setDialogOpen(true);
  };

  const handleAddSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, newSubtask.trim()]);
    setNewSubtask("");
  };

  const handleRemoveSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index));
  };

  // HTML5 Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (isNaN(sourceIndex) || sourceIndex === targetIndex) return;

    const list = [...subtasks];
    const [moved] = list.splice(sourceIndex, 1);
    list.splice(targetIndex, 0, moved);
    setSubtasks(list);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) return toast.error("Template name is required");

    try {
      if (editingTemplate) {
        await updateTemplate(
          editingTemplate.id,
          {
            templateName: templateName.trim(),
            description: description.trim(),
            subtasks,
          },
          actor,
        );
        toast.success("Template updated successfully!");
      } else {
        await createTemplate(templateName.trim(), description.trim(), subtasks, actor);
        toast.success("Template created successfully!");
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save template");
    }
  };

  const handleDelete = async (tpl: TaskTemplate) => {
    if (!isAdmin) return toast.error("Only admins can delete templates.");
    if (!confirm(`Are you sure you want to delete template "${tpl.templateName}"?`)) return;

    try {
      await deleteTemplate(tpl.id, actor);
      toast.success("Template deleted successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete template");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-800 flex items-center gap-2">
            <FileText className="size-6 text-primary" /> Task Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure reusable checklists and process subtasks for operational workflows.
          </p>
        </div>

        {isAdmin && (
          <Button onClick={handleOpenCreate} size="sm" className="gap-1.5 shrink-0">
            <Plus className="size-4" /> Create Template
          </Button>
        )}
      </div>

      {/* Mode Notification */}
      {!isAdmin && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl flex items-center gap-2">
          <ShieldAlert className="size-4 shrink-0" />
          <span>
            <strong>Read-Only Mode:</strong> Staff users can view task templates, but only
            administrators can configure or delete them.
          </span>
        </div>
      )}

      {/* Grid List */}
      {loading ? (
        <div className="text-center py-20 text-muted-foreground">Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20 border border-dashed rounded-2xl bg-muted/5">
          <FileText className="size-10 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No task templates configured yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl) => (
            <Card
              key={tpl.id}
              className="border shadow-sm flex flex-col justify-between hover:shadow-md transition"
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-gray-800">
                  {tpl.templateName}
                </CardTitle>
                {tpl.description && (
                  <CardDescription className="text-xs line-clamp-2 mt-1">
                    {tpl.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Checklist Items ({tpl.subtasks?.length || 0})
                  </span>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {tpl.subtasks?.map((st, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 text-xs text-gray-600 bg-slate-50 p-1.5 rounded border"
                      >
                        <CheckCircle className="size-3.5 text-emerald-500 shrink-0" />
                        <span className="truncate">{st}</span>
                      </div>
                    ))}
                    {(!tpl.subtasks || tpl.subtasks.length === 0) && (
                      <span className="text-xs text-muted-foreground italic">
                        No checklist items configured
                      </span>
                    )}
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex gap-2 border-t pt-3 justify-end">
                    <Button
                      onClick={() => handleOpenEdit(tpl)}
                      variant="outline"
                      size="xs"
                      className="h-8 gap-1"
                    >
                      <Edit className="size-3.5" /> Edit
                    </Button>
                    <Button
                      onClick={() => handleDelete(tpl)}
                      variant="outline"
                      size="xs"
                      className="h-8 text-destructive hover:bg-destructive/10 border-destructive/20 gap-1"
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSave}
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh] border"
          >
            <div className="p-5 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-gray-800">
                {editingTemplate ? "Edit Template" : "Create Task Template"}
              </h3>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="space-y-1">
                <Label htmlFor="tplName" className="text-xs font-bold uppercase text-gray-500">
                  Template Name *
                </Label>
                <Input
                  id="tplName"
                  required
                  placeholder="e.g. Insurance Renewal"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="tplDesc" className="text-xs font-bold uppercase text-gray-500">
                  Description
                </Label>
                <Input
                  id="tplDesc"
                  placeholder="Operational subtask workflow description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* Subtasks Configurator */}
              <div className="space-y-2 border-t pt-3">
                <Label className="text-xs font-bold uppercase text-gray-500 block">
                  Configure Subtask Checklist
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter checklist item (e.g. Call Client)"
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddSubtask();
                      }
                    }}
                  />
                  <Button type="button" onClick={handleAddSubtask}>
                    Add
                  </Button>
                </div>

                <div className="space-y-1.5 mt-3 max-h-60 overflow-y-auto bg-slate-50 p-2.5 border rounded-lg">
                  {subtasks.map((st, index) => (
                    <div
                      key={index}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                      className="flex items-center justify-between gap-2 bg-white p-2 rounded border shadow-sm cursor-move hover:border-primary/40 active:opacity-60 transition"
                    >
                      <div className="flex items-center gap-2 text-xs text-gray-700 truncate">
                        <GripVertical className="size-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">
                          {index + 1}. {st}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSubtask(index)}
                        className="text-red-500 hover:text-red-800 p-0.5 rounded"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  {subtasks.length === 0 && (
                    <div className="text-center py-6 text-xs text-muted-foreground italic flex items-center justify-center gap-1.5">
                      <AlertCircle className="size-4 text-muted-foreground" /> Configure subtasks to
                      populate automatically.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50 flex gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="gap-1">
                <Save className="size-4" /> Save Template
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
