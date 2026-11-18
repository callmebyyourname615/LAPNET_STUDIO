import { useState } from "react";
import { ArrowUpRight, FileClock, FileText, Link2, Plus } from "lucide-react";
import { taskDocumentsSchema } from "@lapnet/contracts";
import { Skeleton } from "../../components/ui/skeleton";
import { apiRequest } from "../../lib/api";
import { formatLaoTimestamp } from "../../i18n/lo-date";
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
      {data && (
        <>
          {!preview && documents.length > 0 && (
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
          )}
          {!documents.length && (
            <p className="task-documents-empty">
              <FileText size={18} aria-hidden="true" />
              ຍັງບໍ່ພົບເອກະສານທີ່ເບິ່ງໄດ້
            </p>
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
              {!preview && <h3 className="task-subsection-title">ປະຫວັດເອກະສານ</h3>}
              <ol className="task-workspace-rows">
                {activity.map((event) => (
                  <li className="task-event-row" data-tone="document" key={event.id}>
                    <span className="task-row-icon">
                      {event.kind === "linked" ? (
                        <Link2 size={17} aria-hidden="true" />
                      ) : (
                        <FileClock size={17} aria-hidden="true" />
                      )}
                    </span>
                    <div className="task-row-content">
                      <strong>
                        {event.kind === "linked" ? "ເຊື່ອມເອກະສານ" : `ອັບໂຫຼດສະບັບ ${event.version}`}
                      </strong>
                      <span>
                        {event.title}
                        {event.filename && ` · ${event.filename}`}
                      </span>
                      {event.actorName && <small>{event.actorName}</small>}
                    </div>
                    <time dateTime={event.occurredAt}>{formatLaoTimestamp(event.occurredAt)}</time>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </section>
  );
}
