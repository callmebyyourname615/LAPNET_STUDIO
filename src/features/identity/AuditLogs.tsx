import { useEffect, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { auditPageSchema, type AuditEvent } from "@lapnet/contracts";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { apiRequest, ApiError } from "../../lib/api";
import { Skeleton } from "../../components/ui/skeleton";
import { useAuth, errorText } from "./Auth";
import "./audit-logs.css";

const categories = {
  company: "ບໍລິສັດ",
  post: "ຂ່າວວຽກ",
  interaction: "ການຕິດຕໍ່",
  auth: "ການເຂົ້າລະບົບ",
  account: "ບັນຊີສ່ວນຕົວ",
  task: "ວຽກ",
  document: "ເອກະສານ",
  organization: "ອົງກອນ ແລະ ສິດ",
  resource: "ການແບ່ງປັນ",
  activity: "ການເຂົ້າໃຊ້",
};
const actionNames: Record<string, string> = {
  "auth.login": "ເຂົ້າລະບົບ",
  "auth.logout": "ອອກຈາກລະບົບ",
  "auth.login_failed": "ເຂົ້າລະບົບບໍ່ສຳເລັດ",
  "auth.login_rate_limited": "ລອງເຂົ້າລະບົບເກີນກຳນົດ",
  "auth.password_changed": "ປ່ຽນລະຫັດຜ່ານ",
  "account.profile_updated": "ແກ້ໄຂໂປຣໄຟລ໌",
  "account.avatar_updated": "ປ່ຽນຮູບໂປຣໄຟລ໌",
  "account.cover_updated": "ປ່ຽນຮູບປົກ",
  "account.avatar_removed": "ລຶບຮູບໂປຣໄຟລ໌",
  "account.cover_removed": "ລຶບຮູບປົກ",
  "activity.page_viewed": "ເປີດໜ້າ",
  "activity.request": "ເອີ້ນໃຊ້ລະບົບ",
  "resource.shared": "ແບ່ງປັນສິດ",
  "resource.revoked": "ຖອນສິດແບ່ງປັນ",
  "resource.linked": "ເຊື່ອມໂຍງລາຍການ",
  "user.password_reset": "ອອກລະຫັດຜ່ານໃໝ່",
  "role.assigned": "ມອບບົດບາດ",
  "role.revoked": "ຖອນບົດບາດ",
  "membership.created": "ເພີ່ມສະມາຊິກພະແນກ",
  "membership.ended": "ສິ້ນສຸດສະມາຊິກພະແນກ",
  "position.assigned": "ມອບຕຳແໜ່ງ",
  "position.ended": "ສິ້ນສຸດຕຳແໜ່ງ",
  "document.folder_created": "ສ້າງໂຟນເດີ",
  "document.folder_updated": "ແກ້ໄຂໂຟນເດີ",
  "document.folder_deleted": "ລຶບໂຟນເດີ",
  "document.download_authorized": "ອະນຸຍາດເປີດ/ດາວໂຫຼດໄຟລ໌",
  "document.scan_retried": "ສົ່ງໄຟລ໌ກວດໃໝ່",
};
const kinds: Record<string, string> = {
  user: "ຜູ້ໃຊ້",
  department: "ພະແນກ",
  task: "ວຽກ",
  document: "ເອກະສານ",
  company: "ບໍລິສັດ",
  post: "ຂ່າວວຽກ",
  interaction: "ການຕິດຕໍ່",
};
const verbs: Record<string, string> = {
  created: "ສ້າງ",
  updated: "ແກ້ໄຂ",
  archived: "ເກັບເຂົ້າຄັງ",
  transitioned: "ປ່ຽນສະຖານະ",
  participants_shared: "ແບ່ງປັນກັບຜູ້ຮ່ວມວຽກ",
};
function actionLabel(event: AuditEvent) {
  if (event.action === "activity.request")
    return `${event.metadata.method === "GET" ? "ເບິ່ງຂໍ້ມູນ" : "ເອີ້ນໃຊ້ລະບົບ"}${event.metadata.search ? " · ຄົ້ນຫາ" : ""}`;
  const [kind, verb] = event.action.split(".");
  return (
    actionNames[event.action] ??
    (kinds[kind] && verbs[verb] ? `${verbs[verb]}${kinds[kind]}` : event.action)
  );
}
const dateFormat = new Intl.DateTimeFormat("lo-LA", {
  calendar: "gregory",
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Vientiane",
});
const outcomeLabel = (event: AuditEvent) => (event.outcome === "failure" ? "ບໍ່ສຳເລັດ" : "ສຳເລັດ");
type Filters = {
  q: string;
  actor: string;
  category: string;
  outcome: string;
  from: string;
  to: string;
};
const emptyFilters: Filters = { q: "", actor: "", category: "", outcome: "", from: "", to: "" };

export default function AuditLogs() {
  const { me } = useAuth();
  return me?.capabilities.viewAudit ? (
    <AuditLogList />
  ) : (
    <section className="panel audit-denied">
      <ShieldCheck size={28} />
      <h1>ບໍ່ມີສິດເຂົ້າເຖິງ</h1>
      <p>ປະຫວັດນີ້ສຳລັບຜູ້ດູແລລະບົບສູງສຸດເທົ່ານັ້ນ.</p>
    </section>
  );
}
function AuditLogList() {
  const detailButton = useRef<HTMLButtonElement | null>(null);
  const [draft, setDraft] = useState(emptyFilters),
    [filters, setFilters] = useState(emptyFilters);
  const [cursors, setCursors] = useState<string[]>([""]),
    [reload, setReload] = useState(0);
  const [page, setPage] = useState<ReturnType<typeof auditPageSchema.parse> | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [denied, setDenied] = useState(false);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const cursor = cursors.at(-1)!;
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError("");
    setPage(null);
    const query = new URLSearchParams({ limit: "25" });
    for (const key of ["q", "actor", "category", "outcome"] as const)
      if (filters[key]) query.set(key, filters[key]);
    if (filters.from) query.set("from", new Date(filters.from + "T00:00:00+07:00").toISOString());
    if (filters.to)
      query.set(
        "to",
        new Date(new Date(filters.to + "T00:00:00+07:00").getTime() + 86_400_000).toISOString(),
      );
    if (cursor) query.set("cursor", cursor);
    apiRequest<unknown>("/api/v1/audit-events?" + query, "GET", undefined, request.signal)
      .then((result) => {
        if (!request.signal.aborted) setPage(auditPageSchema.parse(result));
      })
      .catch((err: unknown) => {
        if (!request.signal.aborted) {
          setError(errorText(err));
          if (err instanceof ApiError && err.status === 403) {
            setDenied(true);
            setSelected(null);
          }
        }
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [filters, cursor, reload]);
  function submit(event: FormEvent) {
    event.preventDefault();
    setCursors([""]);
    setFilters({ ...draft });
    setSelected(null);
  }
  const field = (key: keyof Filters, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  if (denied)
    return (
      <section className="panel audit-denied">
        <ShieldCheck size={28} />
        <h1>ບໍ່ມີສິດເຂົ້າເຖິງ</h1>
        <p>ສິດເບິ່ງປະຫວັດຖືກປ່ຽນແລ້ວ.</p>
      </section>
    );
  return (
    <div className="audit-page">
      <div className="page-header">
        <div>
          <span className="audit-eyebrow">
            <ShieldCheck size={15} /> ສຳລັບຜູ້ດູແລສູງສຸດ
          </span>
          <h1>ປະຫວັດການໃຊ້ງານ</h1>
          <p>ຕິດຕາມວ່າໃຜເຮັດຫຍັງ ແລະ ເມື່ອໃດ ໃນ Portal ແລະ Document.</p>
        </div>
        <button
          className="button"
          disabled={loading}
          onClick={() => {
            setCursors([""]);
            setReload((n) => n + 1);
          }}
        >
          <RefreshCw size={16} /> ໂຫຼດໃໝ່
        </button>
      </div>
      <form className="audit-filters" onSubmit={submit}>
        <label className="audit-search">
          ຄົ້ນຫາກິດຈະກຳ ຫຼື ເລກອ້າງອີງ
          <div>
            <Search size={17} />
            <input
              value={draft.q}
              maxLength={100}
              placeholder="auth.login, task.created, ID…"
              onChange={(e) => field("q", e.target.value)}
            />
          </div>
        </label>
        <label>
          ຜູ້ໃຊ້
          <input
            value={draft.actor}
            maxLength={100}
            placeholder="ຊື່ ຫຼື username"
            onChange={(e) => field("actor", e.target.value)}
          />
        </label>
        <label>
          ປະເພດ
          <select
            aria-label="ປະເພດ"
            value={draft.category}
            onChange={(e) => field("category", e.target.value)}
          >
            <option value="">ທຸກປະເພດ</option>
            {Object.entries(categories).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          ຜົນລັບ
          <select
            aria-label="ຜົນລັບ"
            value={draft.outcome}
            onChange={(e) => field("outcome", e.target.value)}
          >
            <option value="">ທັງໝົດ</option>
            <option value="success">ສຳເລັດ</option>
            <option value="failure">ບໍ່ສຳເລັດ</option>
          </select>
        </label>
        <label>
          ຕັ້ງແຕ່
          <input
            type="date"
            value={draft.from}
            max={draft.to || "9999-12-31"}
            onChange={(e) => field("from", e.target.value)}
          />
        </label>
        <label>
          ເຖິງ
          <input
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            max="9999-12-31"
            onChange={(e) => field("to", e.target.value)}
          />
        </label>
        <div className="audit-filter-actions">
          <button className="button primary" type="submit">
            ກັ່ນຕອງ
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              setDraft(emptyFilters);
              setFilters({ ...emptyFilters });
              setCursors([""]);
            }}
          >
            ລ້າງຕົວກອງ
          </button>
        </div>
      </form>
      <section className="audit-results" aria-label="ລາຍການປະຫວັດ">
        <div className="audit-results-heading">
          <strong>{page ? `${page.total.toLocaleString("lo-LA")} ກິດຈະກຳ` : "ກິດຈະກຳ"}</strong>
          <span>ໃໝ່ສຸດກ່ອນ · ເວລາວຽງຈັນ (UTC+07)</span>
        </div>
        {loading ? (
          <div className="audit-placeholder">
            <Skeleton variant="rows" rows={6} />
          </div>
        ) : error ? (
          <div className="audit-placeholder" role="alert">
            <p>{error}</p>
            <button className="button" onClick={() => setReload((n) => n + 1)}>
              ລອງໃໝ່
            </button>
          </div>
        ) : !page?.items.length ? (
          <div className="audit-empty">
            <Search size={25} />
            <h2>ບໍ່ພົບກິດຈະກຳ</h2>
            <p>ລອງປ່ຽນຊື່ຜູ້ໃຊ້ ຫຼື ຊ່ວງເວລາ.</p>
          </div>
        ) : (
          <div className="audit-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ເວລາ</th>
                  <th>ຜູ້ໃຊ້</th>
                  <th>ກິດຈະກຳ</th>
                  <th>ລາຍການອ້າງອີງ</th>
                  <th>ຜົນລັບ</th>
                  <th>
                    <span className="sr-only">ລາຍລະອຽດ</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <time dateTime={event.occurredAt}>
                        {dateFormat.format(new Date(event.occurredAt))}
                      </time>
                    </td>
                    <td>
                      <strong>{event.actor?.displayName ?? "ລະບົບ / ບໍ່ຢືນຢັນຕົວຕົນ"}</strong>
                      {event.actor?.username && <small>@{event.actor.username}</small>}
                      {!event.actor && typeof event.metadata.attemptedUsername === "string" && (
                        <small>ຊື່ທີ່ລອງ: {event.metadata.attemptedUsername}</small>
                      )}
                    </td>
                    <td>
                      <strong>{actionLabel(event)}</strong>
                      <small>{event.action}</small>
                    </td>
                    <td>
                      <code title={event.targetId ?? undefined}>
                        {event.targetId?.slice(0, 8) ?? "—"}
                      </code>
                      {typeof event.metadata.path === "string" && (
                        <small className="audit-path" title={event.metadata.path}>
                          {event.metadata.path}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className="audit-outcome" data-outcome={event.outcome}>
                        <i />
                        {outcomeLabel(event)}
                        {typeof event.metadata.status === "number"
                          ? ` · ${event.metadata.status}`
                          : ""}
                      </span>
                    </td>
                    <td>
                      <button
                        className="audit-detail-button"
                        aria-label={"ລາຍລະອຽດ " + event.action}
                        onClick={(e) => {
                          detailButton.current = e.currentTarget;
                          setSelected(event);
                        }}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="audit-pagination">
          <span>ໜ້າ {cursors.length}</span>
          <button
            className="button"
            disabled={loading || cursors.length <= 1}
            onClick={() => setCursors((values) => values.slice(0, -1))}
          >
            <ArrowLeft size={16} /> ກ່ອນໜ້າ
          </button>
          <button
            className="button"
            disabled={loading || !page?.nextCursor}
            onClick={() => {
              if (page?.nextCursor) setCursors((values) => [...values, page.nextCursor!]);
            }}
          >
            ຖັດໄປ <ArrowRight size={16} />
          </button>
        </div>
      </section>
      <p className="audit-footnote">
        ປະຫວັດອ່ານໄດ້ຢ່າງດຽວ. ການລອງເຂົ້າລະບົບທີ່ບໍ່ສຳເລັດຈະບໍ່ລະບຸວ່າເປັນຜູ້ໃຊ້ທີ່ຢືນຢັນແລ້ວ.
      </p>
      <Dialog.Root
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="audit-dialog-overlay" />
          <Dialog.Content
            className="audit-dialog"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              detailButton.current?.focus();
            }}
          >
            <Dialog.Title>ລາຍລະອຽດກິດຈະກຳ</Dialog.Title>
            <Dialog.Description>{selected && actionLabel(selected)}</Dialog.Description>
            <Dialog.Close className="audit-dialog-close" aria-label="ປິດ">
              <X size={20} />
            </Dialog.Close>
            {selected && (
              <dl>
                {[
                  ["ເວລາ", dateFormat.format(new Date(selected.occurredAt))],
                  ["ຜູ້ໃຊ້", selected.actor?.displayName ?? "ລະບົບ / ບໍ່ຢືນຢັນຕົວຕົນ"],
                  ["User ID", selected.actorId ?? "—"],
                  ["ກິດຈະກຳ", selected.action],
                  ["ຜົນລັບ", outcomeLabel(selected)],
                  ["Target ID", selected.targetId ?? "—"],
                  ["Request ID", selected.requestId ?? "—"],
                  ["Event ID", selected.id],
                  ...Object.entries(selected.metadata).map(([key, value]) => [
                    key,
                    Array.isArray(value) ? value.join(", ") : String(value),
                  ]),
                ].map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
