import { useEffect, useRef, useState, type DragEvent } from "react";
import { FileText, Upload, X } from "lucide-react";
import { uploadFile } from "@/lib/api";
import { errorText } from "../identity/Auth";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtBytes } from "../document-workspace/lib/format";

const accept = ".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.webp,.txt,.csv,.zip";
export function TaskDocumentUpload({ id, onUploaded }: { id: string; onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null),
    request = useRef<AbortController | null>(null);
  const [files, setFiles] = useState<File[]>([]),
    [title, setTitle] = useState(""),
    [note, setNote] = useState("");
  const [busy, setBusy] = useState(false),
    [dragging, setDragging] = useState(false);
  const [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  useEffect(() => () => request.current?.abort(), []);
  function choose(chosen: File[]) {
    if (busy) return;
    setError("");
    setSuccess("");
    if (chosen.some((file) => !file.size || file.size > 25 * 1024 * 1024)) {
      setError("ໄຟລ໌ຕ້ອງບໍ່ວ່າງ ແລະ ບໍ່ເກີນ 25 MiB ຕໍ່ໄຟລ໌.");
      return;
    }
    setFiles((old) => [
      ...old,
      ...chosen.filter(
        (file) =>
          !old.some(
            (before) =>
              before.name === file.name &&
              before.size === file.size &&
              before.lastModified === file.lastModified,
          ),
      ),
    ]);
  }
  function drag(event: DragEvent) {
    event.preventDefault();
    if (!busy) setDragging(true);
  }
  async function submit() {
    if (busy || !files.length) return;
    const batch = [...files],
      controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setSuccess("");
    setProgress({ done: 0, total: batch.length });
    try {
      for (let index = 0; index < batch.length; index++) {
        const file = batch[index];
        await uploadFile(`/api/v1/tasks/${id}/documents`, file, {
          title: batch.length === 1 ? title.trim() : undefined,
          note: note.trim(),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setFiles((old) => old.filter((item) => item !== file));
        setProgress({ done: index + 1, total: batch.length });
        onUploaded();
      }
      setTitle("");
      setNote("");
      setSuccess(`ອັບໂຫຼດ ${batch.length} ໄຟລ໌ເຂົ້າວຽກແລ້ວ.`);
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorText(failure));
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        request.current = null;
      }
    }
  }
  return (
    <form
      className="task-file-upload"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      aria-busy={busy}
    >
      <div
        className="task-file-drop"
        data-dragging={dragging || undefined}
        onDragOver={drag}
        onDragEnter={drag}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          choose(Array.from(event.dataTransfer.files));
        }}
      >
        <span className="task-file-upload-mark">
          <Upload size={21} aria-hidden="true" />
        </span>
        <div>
          <h3>ອັບໂຫຼດເອກະສານເຂົ້າວຽກ</h3>
          <p>ທຸກຄົນທີ່ມີສິດເບິ່ງວຽກນີ້ອັບໂຫຼດໄດ້ · ສູງສຸດ 25 MiB ຕໍ່ໄຟລ໌</p>
        </div>
        <input
          ref={input}
          tabIndex={-1}
          className="sr-only"
          type="file"
          multiple
          accept={accept}
          disabled={busy}
          aria-label="ເລືອກໄຟລ໌ເຂົ້າວຽກ"
          onChange={(event) => {
            choose(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          ເລືອກໄຟລ໌
        </button>
      </div>
      {!!files.length && (
        <>
          <ul className="task-upload-files">
            {files.map((file, index) => (
              <li key={`${file.name}:${file.lastModified}:${index}`}>
                <FileText size={17} aria-hidden="true" />
                <span>
                  {file.name}
                  <small>{fmtBytes(file.size)}</small>
                </span>
                <button
                  type="button"
                  className="task-upload-remove"
                  disabled={busy}
                  aria-label={`ເອົາ ${file.name} ອອກ`}
                  onClick={() => {
                    setFiles((old) => old.filter((item) => item !== file));
                    setError("");
                  }}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <div className="task-upload-fields">
            {files.length === 1 && (
              <label>
                ຊື່ເອກະສານ (ບໍ່ບັງຄັບ)
                <input
                  maxLength={200}
                  value={title}
                  placeholder={files[0].name}
                  disabled={busy}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
            )}
            <label>
              ບັນທຶກການອັບໂຫຼດ (ບໍ່ບັງຄັບ)
              <input
                maxLength={500}
                value={note}
                disabled={busy}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </div>
          <div className="task-upload-actions">
            <p className="task-help">ເອກະສານໃໝ່ຈະປາກົດໃນ Document tab ແລະ ໃຊ້ສິດຕາມວຽກນີ້.</p>
            <button className="button primary" disabled={busy} type="submit">
              {busy && <Skeleton variant="inline" label="ກຳລັງອັບໂຫຼດ..." />}
              <Upload size={16} aria-hidden="true" />
              ອັບໂຫຼດເຂົ້າວຽກ
            </button>
          </div>
        </>
      )}
      {busy && (
        <p className="task-help" role="status">
          ອັບໂຫຼດແລ້ວ {progress.done} / {progress.total} ໄຟລ໌
        </p>
      )}
      {error && (
        <p className="identity-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="task-upload-success" role="status">
          {success}
        </p>
      )}
    </form>
  );
}
