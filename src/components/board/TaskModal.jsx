import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Trash2, GitBranch, Loader2, Paperclip, Download, File, X, UploadCloud, Eye } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import { Input, Textarea, Select } from "../ui/Input";
import { PRIORITIES } from "../../lib/utils";
import { taskApi } from "../../lib/api";

const toDateInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const empty = (columnId) => ({
  title: "",
  description: "",
  priority: "medium",
  due_date: "",
  assignee_id: "",
  column_id: columnId || "",
});

const formatBytes = (bytes, decimals = 2) => {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const loadSheetJS = () => {
  return new Promise((resolve, reject) => {
    if (window.XLSX) {
      resolve(window.XLSX);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload = () => resolve(window.XLSX);
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

const TaskModal = ({ open, onClose, task, defaultColumnId, columns, members, actions, onBreakdown }) => {
  const isEdit = Boolean(task);
  const [form, setForm] = useState(empty(defaultColumnId));
  const [saving, setSaving] = useState(false);
  const [breakingDown, setBreakingDown] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [textPreview, setTextPreview] = useState("");
  const [loadingText, setLoadingText] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, attachmentId: null, filename: "" });
  const [deletingFile, setDeletingFile] = useState(false);

  useEffect(() => {
    if (previewFile && previewFile.contentType?.startsWith("text/")) {
      setLoadingText(true);
      setTextPreview("");
      fetch(previewFile.url)
        .then((r) => r.text())
        .then((text) => setTextPreview(text))
        .catch(() => setTextPreview("Failed to load file preview content."))
        .finally(() => setLoadingText(false));
    }
  }, [previewFile]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      return toast.error("File size cannot exceed 15 MB");
    }

    setUploading(true);
    try {
      await actions.uploadAttachment(task.id, file);
      toast.success("Document uploaded successfully");
    } catch (err) {
      toast.error(err.message || "Failed to upload document");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleFileDeleteClick = (attachmentId, filename) => {
    setDeleteConfirm({ open: true, attachmentId, filename });
  };

  const handleConfirmDelete = async () => {
    const { attachmentId } = deleteConfirm;
    setDeletingFile(true);
    try {
      await actions.deleteAttachment(task.id, attachmentId);
      toast.success("Document deleted");
      setDeleteConfirm({ open: false, attachmentId: null, filename: "" });
    } catch (err) {
      toast.error(err.message || "Failed to delete document");
    } finally {
      setDeletingFile(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (task) {
      setForm({
        title: task.title || "",
        description: task.description || "",
        priority: task.priority || "medium",
        due_date: toDateInput(task.due_date),
        assignee_id: task.assignee_id || "",
        column_id: task.column_id,
      });
    } else {
      setForm(empty(defaultColumnId || columns[0]?.id));
    }
  }, [open, task, defaultColumnId, columns]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Title is required");
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      priority: form.priority,
      due_date: form.due_date || null,
      assignee_id: form.assignee_id || null,
    };
    try {
      if (isEdit) {
        await actions.updateTask(task.id, payload);
        toast.success("Task updated");
      } else {
        await actions.createTask({ ...payload, column_id: form.column_id });
        toast.success("Task created");
      }
      onClose();
    } catch {
      /* handled in hook */
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await actions.deleteTask(task.id);
    onClose();
  };

  const handleBreakdown = async () => {
    setBreakingDown(true);
    try {
      await onBreakdown(task);
    } finally {
      setBreakingDown(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={isEdit ? "Edit task" : "New task"} size="md">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input label="Title" placeholder="What needs to be done?" autoFocus value={form.title} onChange={set("title")} />
        <Textarea label="Description" rows={4} placeholder="Add more detail…" value={form.description} onChange={set("description")} />

        <div className="grid grid-cols-2 gap-4">
          <Select label="Priority" value={form.priority} onChange={set("priority")}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
          <Input label="Due date" type="date" value={form.due_date} onChange={set("due_date")} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select label="Assignee" value={form.assignee_id} onChange={set("assignee_id")}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
          {!isEdit && (
            <Select label="Column" value={form.column_id} onChange={set("column_id")}>
              {columns.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </Select>
          )}
        </div>

        {isEdit && (
          <div className="border-t border-line/60 pt-4 mt-2">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5" />
                Attachments {task.attachments?.length > 0 && `(${task.attachments.length})`}
              </label>
              <label className="cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
                <span className="flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-600 transition-colors">
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UploadCloud className="h-3.5 w-3.5" />
                  )}
                  Upload file
                </span>
              </label>
            </div>

            {task.attachments?.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {task.attachments.map((att) => {
                  const downloadUrl = taskApi.getAttachmentDownloadUrl(
                    task.board_id,
                    task.id,
                    att.attachment_id
                  );
                  const isImage = att.contentType?.startsWith("image/");
                  return (
                    <div
                      key={att.id}
                      className="group flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-2.5 transition-all hover:bg-surface-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isImage ? (
                          <div className="h-9 w-9 overflow-hidden rounded-lg bg-surface border border-line flex items-center justify-center shrink-0">
                            <img
                              src={downloadUrl}
                              alt={att.filename}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                e.target.style.display = "none";
                              }}
                            />
                          </div>
                        ) : (
                          <div className="h-9 w-9 rounded-lg bg-surface border border-line flex items-center justify-center shrink-0 text-muted">
                            <File className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink leading-normal" title={att.filename}>
                            {att.filename}
                          </p>
                          <p className="text-[11px] text-faint leading-normal mt-0.5">
                            {formatBytes(att.size)} • {att.uploader_name || "Unknown"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => setPreviewFile({ url: downloadUrl, filename: att.filename, contentType: att.contentType })}
                          className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink transition-colors"
                          title="Preview document"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <a
                          href={downloadUrl}
                          download={att.filename}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink transition-colors"
                          title="Download/View file"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleFileDeleteClick(att.attachment_id, att.filename)}
                          className="rounded-lg p-1.5 text-priority-urgent hover:bg-surface transition-colors"
                          title="Delete file"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 rounded-xl border border-dashed border-line bg-surface/50 text-center">
                <Paperclip className="h-6 w-6 text-faint mb-1.5" />
                <p className="text-xs text-muted">No documents uploaded yet</p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          <div>
            {isEdit && (
              <Button type="button" variant="ghost" onClick={handleDelete} className="text-priority-urgent">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {isEdit && (
              <Button type="button" variant="outline" onClick={handleBreakdown} disabled={breakingDown}>
                {breakingDown ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitBranch className="h-4 w-4" />}
                AI breakdown
              </Button>
            )}
            <Button type="submit" loading={saving}>{isEdit ? "Save" : "Create task"}</Button>
          </div>
        </div>
      </form>
    </Modal>

      {previewFile && (
        <Modal
          open={Boolean(previewFile)}
          onClose={() => setPreviewFile(null)}
          title={`Preview: ${previewFile.filename}`}
          size="lg"
        >
          <div className="mt-2">
            {previewFile.contentType?.startsWith("image/") && (
              <div className="flex justify-center items-center bg-surface-2 rounded-2xl overflow-hidden p-2 max-h-[500px]">
                <img
                  src={previewFile.url}
                  alt={previewFile.filename}
                  className="max-w-full max-h-[460px] object-contain rounded-xl shadow-sm"
                />
              </div>
            )}

            {previewFile.contentType === "application/pdf" && (
              <div className="bg-surface-2 rounded-2xl overflow-hidden h-[550px] border border-line">
                <iframe
                  src={previewFile.url}
                  className="w-full h-full border-none"
                  title={previewFile.filename}
                />
              </div>
            )}

            {(previewFile.contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
              previewFile.contentType === "application/vnd.ms-excel" ||
              previewFile.contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
              previewFile.contentType === "application/msword" ||
              previewFile.contentType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
              previewFile.contentType === "application/vnd.ms-powerpoint") && (
              <div className="bg-surface-2 rounded-2xl overflow-hidden h-[550px] border border-line">
                {!previewFile.url.includes("localhost") && !previewFile.url.includes("127.0.0.1") ? (
                  <iframe
                    src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewFile.url)}`}
                    className="w-full h-full border-none"
                    title={previewFile.filename}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                    <File className="h-10 w-10 text-faint mb-2.5" />
                    <p className="text-sm font-semibold text-ink">Office Document Preview</p>
                    <p className="text-xs text-muted mt-1 max-w-sm">
                      Microsoft Office Viewer cannot fetch files from <strong>localhost</strong>. Once deployed to Vercel, this Excel/Word file will preview perfectly!
                    </p>
                    <a
                      href={previewFile.url}
                      download={previewFile.filename}
                      className="mt-4 inline-flex select-none items-center justify-center whitespace-nowrap rounded-full font-semibold transition-all duration-200 ease-[var(--ease-spring)] focus-ring disabled:opacity-50 active:scale-[0.97] h-10 px-5 text-sm gap-2 brand-gradient text-white shadow-[var(--shadow-brand)] hover:brightness-[1.07] hover:shadow-[0_14px_34px_rgba(36,102,70,0.45)]"
                    >
                      <Download className="h-4 w-4" /> Download file
                    </a>
                  </div>
                )}
              </div>
            )}

            {previewFile.contentType?.startsWith("text/") && (
              <div className="border border-line rounded-2xl overflow-hidden">
                {loadingText ? (
                  <div className="flex items-center justify-center py-20 bg-surface-2">
                    <Loader2 className="h-6 w-6 animate-spin text-brand" />
                  </div>
                ) : (
                  <pre className="p-4 bg-surface-2 text-xs font-mono overflow-auto max-h-[480px] text-ink whitespace-pre-wrap leading-relaxed">
                    {textPreview}
                  </pre>
                )}
              </div>
            )}

            {!previewFile.contentType?.startsWith("image/") &&
              previewFile.contentType !== "application/pdf" &&
              !previewFile.contentType?.startsWith("text/") &&
              previewFile.contentType !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" &&
              previewFile.contentType !== "application/vnd.ms-excel" &&
              previewFile.contentType !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
              previewFile.contentType !== "application/msword" &&
              previewFile.contentType !== "application/vnd.openxmlformats-officedocument.presentationml.presentation" &&
              previewFile.contentType !== "application/vnd.ms-powerpoint" && (
                <div className="flex flex-col items-center justify-center py-14 text-center rounded-2xl border border-dashed border-line bg-surface-2/40">
                  <File className="h-12 w-12 text-faint mb-3" />
                  <p className="text-sm font-semibold text-ink">Preview not available</p>
                  <p className="text-xs text-muted mt-1 max-w-sm">
                    This file type ({previewFile.contentType || "unknown"}) cannot be previewed directly in the browser.
                  </p>
                  <a
                    href={previewFile.url}
                    download={previewFile.filename}
                    className="mt-5 inline-flex select-none items-center justify-center whitespace-nowrap rounded-full font-semibold transition-all duration-200 ease-[var(--ease-spring)] focus-ring disabled:opacity-50 active:scale-[0.97] h-10 px-5 text-sm gap-2 brand-gradient text-white shadow-[var(--shadow-brand)] hover:brightness-[1.07] hover:shadow-[0_14px_34px_rgba(36,102,70,0.45)]"
                  >
                    <Download className="h-4 w-4" /> Download file
                  </a>
                </div>
              )}
          </div>
        </Modal>
      )}

      {/* Attachment Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, attachmentId: null, filename: "" })}
        onConfirm={handleConfirmDelete}
        title="Delete attachment?"
        description={`Are you sure you want to permanently delete "${deleteConfirm.filename}"? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deletingFile}
      />
    </>
  );
};

export default TaskModal;
