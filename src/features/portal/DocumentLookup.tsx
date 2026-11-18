import { useEffect, useId, useState } from "react";
import { workspaceDocumentPageSchema } from "@lapnet/contracts";
import { Skeleton } from "@/components/ui/skeleton";
import { useTaskData } from "../tasks/api";
import "./document-lookup.css";

export function DocumentLookup({
  value,
  onChange,
  label,
  required,
}: {
  value: string;
  onChange: (id: string) => void;
  label: string;
  required: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(""),
    [query, setQuery] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(draft.trim()), 250);
    return () => clearTimeout(timer);
  }, [draft]);
  const params = new URLSearchParams({ limit: "10", q: query });
  if (cursors.length) params.set("cursor", cursors.at(-1)!);
  const { data, error, loading, reload } = useTaskData(
    "/api/v1/document-workspace/documents?" + params,
    workspaceDocumentPageSchema,
  );
  const pending = loading || draft.trim() !== query;
  return (
    <div className="portal-document-lookup">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="search"
        value={draft}
        maxLength={100}
        placeholder="ຊື່ເອກະສານ, ຊື່ໄຟລ໌ ຫຼື ເລກທະບຽນ"
        onChange={(event) => {
          setDraft(event.target.value);
          setCursors([]);
          onChange("");
        }}
      />
      <p className="task-help">ເລືອກເອກະສານທີ່ມີສິດເບິ່ງ ແລ້ວກົດບັນທຶກການເຊື່ອມ.</p>
      {pending ? (
        <Skeleton variant="rows" rows={2} />
      ) : error ? (
        <div className="identity-error" role="alert">
          <p>{error}</p>
          <button type="button" className="button secondary" onClick={reload}>
            ລອງໃໝ່
          </button>
        </div>
      ) : (
        data && (
          <>
            <p className="task-help" role="status">
              {data.total} ເອກະສານ
            </p>
            {data.items.length ? (
              <fieldset className="portal-document-options">
                <legend className="sr-only">ເລືອກເອກະສານ</legend>
                {data.items.map((document) => (
                  <label
                    key={document.id}
                    className="portal-document-option"
                    data-selected={value === document.id || undefined}
                  >
                    <input
                      type="radio"
                      name={id + "-document"}
                      value={document.id}
                      checked={value === document.id}
                      required={required}
                      onChange={() => onChange(document.id)}
                    />
                    <span>
                      <strong>{document.title}</strong>
                      <small>
                        {document.code}
                        {document.registryNumber ? " · " + document.registryNumber : ""}
                      </small>
                      {document.versions[0] && <small>{document.versions[0].filename}</small>}
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <p className="task-documents-empty" role="status">
                {query
                  ? "ບໍ່ພົບເອກະສານທີ່ກົງກັນ. ລອງປ່ຽນຄຳຄົ້ນຫາ."
                  : "ຍັງບໍ່ມີເອກະສານທີ່ທ່ານມີສິດເບິ່ງ. ໃຫ້ເຈົ້າຂອງເອກະສານແບ່ງປັນສິດກ່ອນ."}
              </p>
            )}
            {(cursors.length > 0 || data.nextCursor) && (
              <div className="task-pagination">
                <button
                  type="button"
                  className="button secondary"
                  disabled={!cursors.length}
                  onClick={() => {
                    setCursors(cursors.slice(0, -1));
                    onChange("");
                  }}
                >
                  ກ່ອນໜ້າ
                </button>
                <span>ໜ້າ {cursors.length + 1}</span>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!data.nextCursor}
                  onClick={() => {
                    if (data.nextCursor) setCursors([...cursors, data.nextCursor]);
                    onChange("");
                  }}
                >
                  ຖັດໄປ
                </button>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
