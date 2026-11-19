import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, FileText, Plus } from "lucide-react";
import { taskDocumentsSchema } from "@lapnet/contracts";
import { Skeleton } from "../../components/ui/skeleton";
import { apiRequest } from "../../lib/api";
import { TaskDocumentUpload } from "./TaskDocumentUpload";
import { TaskDocumentTimeline } from "./TaskDocumentTimeline";
import "./task-document-files.css";
import { Failure, Loading, ResourceLookup, useWrite } from "../portal/common";
import { useTaskData } from "./api";

export function TaskDocuments({
  id,
  edit,
  go,
  preview = false,
  startAdding = false,
  onOpen,
}: {
  id: string;
  edit: boolean;
  go: (path: string) => void;
  preview?: boolean;
  startAdding?: boolean;
  onOpen?: () => void;
}) {
  const path = `/api/v1/resources/${id}/links`;
  const { data, error, loading, reload } = useTaskData(
    `/api/v1/tasks/${id}/documents`,
    taskDocumentsSchema,
  );
  const [adding, setAdding] = useState(startAdding);
  const [target, setTarget] = useState("");
  const initialized = useRef("");
  useEffect(() => {
    if (!data || preview || !edit || initialized.current === id) return;
    initialized.current = id;
    if (!data.items.length) setAdding(true);
  }, [data, preview, edit, id]);
  useEffect(() => {
    const onFocus = () => {
      if (!document.hidden) reload();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);
  useEffect(() => {
    if (error) return;
    const timer = setInterval(() => {
      if (!document.hidden) reload();
    }, 15000);
    return () => clearInterval(timer);
  }, [error, reload]);
  const write = useWrite();
  const documents = data?.items ?? [];
  const activity = preview ? data?.activity.slice(0, 2) : data?.activity;

  return (
    <section
      className="task-workspace-section task-documents"
      aria-labelledby="task-documents-title"
    >
      <div className="task-section-heading">
        <h2 id="task-documents-title">
          {preview ? "ປະຫວັດເອກະສານ" : "ເອກະສານທີ່ກ່ຽວຂ້ອງ"}
          {data && <span> ({documents.length})</span>}
        </h2>
        {onOpen && (
          <button className="text-button" type="button" onClick={onOpen}>
            ເບິ່ງທັງໝົດ <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <Loading loading={loading} error={error} reload={reload} />
      {!preview && <TaskDocumentUpload id={id} onUploaded={reload} />}
      {data && (
        <>
          {!preview && documents.length > 0 && (
            <details className="task-document-catalog">
              <summary>ເອກະສານທັງໝົດ ({documents.length})</summary>
              <ul className="task-document-list">
                {documents.map((document) => (
                  <li key={document.id}>
                    <button
                      className="task-document-link"
                      type="button"
                      onClick={() => go(document.href)}
                    >
                      <span className="task-document-icon">
                        <FileText size={16} aria-hidden="true" />
                      </span>
                      <span className="task-row-content">
                        <strong>{document.title}</strong>
                        {document.latestVersion !== null && (
                          <small>ສະບັບ {document.latestVersion}</small>
                        )}
                      </span>
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!documents.length && (
            <div className="task-document-empty-state">
              <p className="task-documents-empty">
                <FileText size={18} aria-hidden="true" />
                ຍັງບໍ່ມີເອກະສານທີ່ເຊື່ອມກັບວຽກນີ້ ແລະ ທ່ານມີສິດເບິ່ງ
              </p>
              {!preview && (
                <>
                  <p className="task-help">
                    {edit
                      ? "ເລືອກເອກະສານຈາກ Document tab ດ້ານລຸ່ມ ແລ້ວກົດບັນທຶກການເຊື່ອມ."
                      : "ໃຫ້ທີມເຊື່ອມເອກະສານ ແລະ ໃຫ້ເຈົ້າຂອງເອກະສານແບ່ງປັນສິດເບິ່ງ."}
                  </p>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => go("/document-workspace")}
                  >
                    ເປີດ Document tab <ArrowUpRight size={14} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          )}
          {edit && !preview && (
            <>
              <button
                className="button secondary"
                type="button"
                aria-expanded={adding}
                disabled={write.busy}
                onClick={() => {
                  setTarget("");
                  setAdding((open) => !open);
                }}
              >
                {!adding && <Plus size={16} aria-hidden="true" />}
                {adding ? "ຍົກເລີກ" : "ເຊື່ອມເອກະສານ"}
              </button>
              {adding && (
                <form
                  className="identity-form"
                  aria-busy={write.busy}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!target) return;
                    void write.run(async () => {
                      if (!documents.some((document) => document.id === target)) {
                        await apiRequest(path, "POST", { targetId: target, kind: "attachment" });
                      }
                      setTarget("");
                      setAdding(false);
                      reload();
                    });
                  }}
                >
                  <fieldset disabled={write.busy} className="portal-fields">
                    <ResourceLookup
                      kind="document"
                      value={target}
                      onChange={setTarget}
                      label="ຄົ້ນຫາເອກະສານ"
                      required
                    />
                  </fieldset>
                  <Failure error={write.error} />
                  <button className="button primary" type="submit" disabled={write.busy || !target}>
                    {write.busy && <Skeleton variant="inline" />}
                    ບັນທຶກການເຊື່ອມ
                  </button>
                </form>
              )}
            </>
          )}
          {!!activity?.length && (
            <>
              {!preview && (
                <div className="task-file-timeline-heading">
                  <h3>Timeline ເອກະສານ</h3>
                  <p className="task-help">ຜູ້ສົ່ງ · ໄຟລ໌ · ວັນທີ ແລະ ເວລາວຽງຈັນ</p>
                </div>
              )}
              <TaskDocumentTimeline activity={activity} go={go} />
            </>
          )}
        </>
      )}
    </section>
  );
}
