import { NotificationInbox } from "../notifications/NotificationCenter";
import { useState } from "react";
import { searchSchema } from "@lapnet/contracts";
import { apiRequest } from "../../lib/api";
import { useTaskData } from "../tasks/api";
import { useAuth } from "../identity/Auth";
import { Loading, Pager, SimpleForm, labels, type Go } from "./common";
export function SearchPage({ query, go }: { query: string; go: Go }) {
  const [draft, setDraft] = useState(new URLSearchParams(query).get("q") ?? ""),
    [q, setQ] = useState(draft),
    [kind, setKind] = useState(""),
    [cursors, setCursors] = useState<string[]>([]);
  const { data, loading, error, reload } = useTaskData(
    "/api/v1/search?limit=25&q=" +
      encodeURIComponent(q) +
      (kind ? "&kind=" + kind : "") +
      (cursors.length ? "&cursor=" + cursors.at(-1) : ""),
    searchSchema,
  );
  return (
    <>
      <div className="page-header">
        <h1>ຄົ້ນຫາຂໍ້ມູນ</h1>
      </div>
      <section className="panel">
        <form
          className="identity-inline"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(draft.trim());
            setCursors([]);
          }}
        >
          <input
            type="search"
            maxLength={100}
            aria-label="ຄຳຄົ້ນຫາ"
            placeholder="ຊື່, ເລກທະບຽນ, ເລກທີເອກະສານ"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <select
            aria-label="ປະເພດຂໍ້ມູນ"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setCursors([]);
            }}
          >
            <option value="">ທຸກປະເພດ</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <button className="button primary">ຄົ້ນຫາ</button>
        </form>
        <Loading loading={loading} error={error} reload={reload} />
        {data && (
          <>
            <p className="task-count">{data.total} ລາຍການທີ່ມີສິດເບິ່ງ</p>
            {data.items.map((x) => (
              <button className="portal-record-link" onClick={() => go(x.href)} key={x.id}>
                <small>
                  {labels[x.kind as keyof typeof labels]} · {x.code}
                </small>
                <strong>{x.title}</strong>
              </button>
            ))}
            {!data.items.length && <p>{q ? "ບໍ່ພົບຂໍ້ມູນ." : "ພິມຄຳຄົ້ນຫາເພື່ອເລີ່ມ."}</p>}
            <Pager next={data.nextCursor} cursors={cursors} set={setCursors} />
          </>
        )}
      </section>
    </>
  );
}
export function NotificationPage({ go }: { go: Go }) {
  const { me } = useAuth();
  return (
    <NotificationInbox go={go}>
      {me?.capabilities.viewAudit && (
        <details className="notify-admin-tools">
          <summary>ວຽກປະມວນຜົນ</summary>
          <Jobs />
        </details>
      )}
    </NotificationInbox>
  );
}
const jobsSchema = {
  parse(value: unknown) {
    return value as {
      counts: { kind: string; status: string; _count: { _all: number } }[];
      failed: {
        id: string;
        kind: string;
        attempts: number;
        errorCode: string | null;
        createdAt: string;
      }[];
    };
  },
};
function Jobs() {
  const { me } = useAuth();
  return me?.capabilities.viewAudit ? <ConnectedJobs /> : null;
}
function ConnectedJobs() {
  const { data, loading, error, reload } = useTaskData("/api/v1/admin/jobs", jobsSchema);
  return (
    <section className="panel">
      <h2>ວຽກປະມວນຜົນ</h2>
      <Loading loading={loading} error={error} reload={reload} />
      {data?.counts.map((x) => (
        <p key={x.kind + x.status}>
          {x.kind} · {x.status}: {x._count._all}
        </p>
      ))}
      {data?.failed.map((x) => (
        <SimpleForm
          key={x.id}
          onSave={async () => {
            await apiRequest(`/api/v1/admin/jobs/${x.id}/retry`, "POST");
            reload();
          }}
        >
          <p>
            {x.kind} · {x.errorCode} · ລອງ {x.attempts} ຄັ້ງ
          </p>
          <span>ສົ່ງຄືນເຂົ້າຄິວ</span>
        </SimpleForm>
      ))}
    </section>
  );
}
