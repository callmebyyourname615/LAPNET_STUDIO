import { Comments } from "../portal/Discussion";
import { Links } from "../portal/common";
import "../portal/portal.css";
import { Skeleton } from "../../components/ui/skeleton";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, ArrowLeft, RefreshCw } from "lucide-react";
import {
  taskPageSchema,
  taskSchema,
  taskHistorySchema,
  taskDepartmentsSchema,
  taskStatuses,
  taskPriorities,
  type TaskStatus,
} from "@lapnet/contracts";
import { apiRequest, ApiError } from "../../lib/api";
import { errorText } from "../identity/Auth";
import { useTaskData, statusNames, priorityNames, actionNames, dueLabel, timeLabel } from "./api";
import { TaskEditor } from "./Editor";
import { TaskSharing } from "./Sharing";
import { t } from "../../i18n/lo";
import "./tasks.css";

type Navigation = { go: (path: string) => void };
function Feedback({
  loading,
  error,
  reload,
}: {
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  return (
    <>
      {loading && <Skeleton variant="rows" />}
      {error && (
        <div role="alert" className="identity-error">
          <p>{error}</p>
          <button className="button secondary" onClick={reload}>
            <RefreshCw size={16} aria-hidden="true" />
            ລອງໃໝ່
          </button>
        </div>
      )}
    </>
  );
}
function TaskBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`status ${status === "done" ? "success" : status === "blocked" ? "warning" : status === "in_progress" ? "info" : "neutral"}`}
    >
      <span className="status-dot" />
      {statusNames[status]}
    </span>
  );
}
export function ConnectedTasks({ id, query, go }: Navigation & { id?: string; query: string }) {
  if (id === "new")
    return (
      <>
        <button className="back-link" onClick={() => go("/tasks")}>
          <ArrowLeft size={16} />
          ກັບໄປລາຍການວຽກ
        </button>
        <TaskEditor sourceInteractionId={new URLSearchParams(query).get("interactionId")??undefined} onCancel={() => go("/tasks")} onSaved={(task) => go("/tasks/" + task.id)} />
      </>
    );
  if (id) return <TaskDetail id={id} go={go} />;
  return <TaskList query={query} go={go} />;
}
function TaskList({ query, go }: Navigation & { query: string }) {
  const initial = new URLSearchParams(query);
  const [search, setSearch] = useState(""),
    [filters, setFilters] = useState({
      q: "",
      status: taskStatuses.includes(initial.get("status") as TaskStatus)
        ? initial.get("status")!
        : initial.get("active") === "true"
          ? "active"
          : "",
      priority: taskPriorities.includes(initial.get("priority") as (typeof taskPriorities)[number])
        ? initial.get("priority")!
        : "",
      departmentId: "",
      view: ["mine", "created", "assigned", "team"].includes(initial.get("view") ?? "")
        ? initial.get("view")!
        : "all",
      due:
        initial.get("due") === "today"
          ? "today"
          : initial.get("state") === "overdue"
            ? "overdue"
            : "",
    }),
    [cursors, setCursors] = useState<string[]>([]);
  const change = (key: keyof typeof filters, value: string) => {
    setFilters((old) => ({ ...old, [key]: value }));
    setCursors([]);
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((old) => ({ ...old, q: search.trim() }));
      setCursors([]);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const params = new URLSearchParams({
    limit: "25",
    ...Object.fromEntries(
      Object.entries(filters).filter(([k, v]) => v && !(k === "status" && v === "active")),
    ),
    ...(filters.status === "active" ? { active: "true" } : {}),
    ...(cursors.length ? { cursor: cursors.at(-1)! } : {}),
  });
  const { data, error, loading, reload } = useTaskData("/api/v1/tasks?" + params, taskPageSchema);
  const departments = useTaskData("/api/v1/departments", taskDepartmentsSchema);
  useEffect(() => {
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);
  return (
    <>
      <div className="page-header task-page-header">
        <div>
          <h1>ວຽກ</h1>
          <p>ລາຍການວຽກທີ່ທ່ານມີສິດເຂົ້າເຖິງ · ບັນທຶກໃນລະບົບ</p>
        </div>
        <button className="button primary" onClick={() => go("/tasks/new")}>
          <Plus size={16} aria-hidden="true" />
          ສ້າງວຽກ
        </button>
      </div>
      <section className="panel">
        <div className="task-filters">
          <label>
            ຄົ້ນຫາ
            <input
              type="search"
              maxLength={100}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ຫົວຂໍ້, ລາຍລະອຽດ ຫຼື TSK-..."
            />
          </label>
          <label>
            ມຸມມອງ
            <select
              aria-label="ມຸມມອງ"
              value={filters.view}
              onChange={(e) => change("view", e.target.value)}
            >
              <option value="all">ທັງໝົດທີ່ມີສິດ</option>
              <option value="mine">ວຽກຂອງຂ້ອຍ</option>
              <option value="created">ຂ້ອຍເປັນຜູ້ສ້າງ</option>
              <option value="assigned">ຂ້ອຍເປັນຜູ້ມອບໝາຍຫຼ້າສຸດ</option>
              <option value="team">ພະແນກຂອງຂ້ອຍ</option>
            </select>
          </label>
          <label>
            ສະຖານະ
            <select
              aria-label="ສະຖານະ"
              value={filters.status}
              onChange={(e) => change("status", e.target.value)}
            >
              <option value="">ທຸກສະຖານະ</option>
              <option value="active">ວຽກທີ່ກຳລັງເປີດ</option>
              {taskStatuses.map((s) => (
                <option key={s} value={s}>
                  {statusNames[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            ຄວາມສຳຄັນ
            <select
              aria-label="ຄວາມສຳຄັນ"
              value={filters.priority}
              onChange={(e) => change("priority", e.target.value)}
            >
              <option value="">ທຸກລະດັບ</option>
              {taskPriorities.map((p) => (
                <option key={p} value={p}>
                  {priorityNames[p]}
                </option>
              ))}
            </select>
          </label>
          <label>
            ພະແນກ
            <select
              aria-label="ພະແນກ"
              value={filters.departmentId}
              onChange={(e) => change("departmentId", e.target.value)}
            >
              <option value="">ທຸກພະແນກ</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {t(d.name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            ກຳນົດເວລາ
            <select
              aria-label="ກຳນົດເວລາ"
              value={filters.due}
              onChange={(e) => change("due", e.target.value)}
            >
              <option value="">ທຸກວັນ</option>
              <option value="today">ຄົບກຳນົດມື້ນີ້</option>
              <option value="overdue">ເກີນກຳນົດ</option>
            </select>
          </label>
        </div>
        <Feedback loading={loading} error={error} reload={reload} />
        {data && (
          <>
            <p className="task-count">{data.total} ລາຍການທີ່ກົງເງື່ອນໄຂ</p>
            <div className="task-records">
              {data.items.map((task) => (
                <button
                  className="task-record"
                  key={task.id}
                  onClick={() => go("/tasks/" + task.id)}
                >
                  <span className="task-record-main">
                    <small>
                      {task.code} · {t(task.department.name)}
                    </small>
                    <strong>{task.title}</strong>
                    <span>
                      {task.assignee.displayName} · {priorityNames[task.priority]}
                    </span>
                  </span>
                  <span className="task-record-state">
                    <TaskBadge status={task.status} />
                    <span className={task.overdue ? "danger-text" : ""}>
                      {task.overdue ? "ເກີນກຳນົດ · " : ""}
                      {dueLabel(task.dueDate)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {!data.items.length && (
              <div className="empty">
                <strong>ບໍ່ມີວຽກທີ່ກົງເງື່ອນໄຂ</strong>
                <span>ລອງປ່ຽນຕົວກັ່ນຕອງ ຫຼື ສ້າງວຽກໃໝ່.</span>
              </div>
            )}
            <div className="task-pagination">
              <button
                className="button secondary"
                disabled={!cursors.length || loading}
                onClick={() => setCursors((old) => old.slice(0, -1))}
              >
                ກ່ອນໜ້າ
              </button>
              <span>ໜ້າ {cursors.length + 1}</span>
              <button
                className="button secondary"
                disabled={!data.nextCursor || loading}
                onClick={() => setCursors((old) => [...old, data.nextCursor!])}
              >
                ຖັດໄປ
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
function TaskDetail({ id, go }: Navigation & { id: string }) {
  const { data: task, error, loading, reload } = useTaskData("/api/v1/tasks/" + id, taskSchema);
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [status, setStatus] = useState<TaskStatus>("todo"),
    [reason, setReason] = useState(""),
    [archiveConfirm, setArchiveConfirm] = useState(false);
  useEffect(() => {
    if (task) setStatus(task.status);
  }, [task]);
  useEffect(() => {
    const focus = () => {
      if (!editing) reload();
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [reload, editing]);
  async function transition(e: FormEvent) {
    e.preventDefault();
    if (!task || busy) return;
    setBusy(true);
    setFailure("");
    try {
      await apiRequest(`/api/v1/tasks/${id}/transitions`, "POST", {
        revision: task.revision,
        status,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setReason("");
      reload();
    } catch (e) {
      setFailure(errorText(e));
      if (e instanceof ApiError && [401, 403, 404].includes(e.status)) reload();
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!task || busy) return;
    setBusy(true);
    setFailure("");
    try {
      await apiRequest(`/api/v1/tasks/${id}/archive`, "POST", { revision: task.revision });
      go("/tasks");
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="back-link" onClick={() => go("/tasks")}>
        <ArrowLeft size={16} aria-hidden="true" />
        ກັບໄປລາຍການວຽກ
      </button>
      <Feedback loading={loading} error={error} reload={reload} />
      {task && (
        <>
          {editing ? (
            <TaskEditor
              key={task.id + ":" + task.revision}
              task={task}
              onSaved={() => {
                setEditing(false);
                reload();
              }}
              onCancel={() => {
                setEditing(false);
                reload();
              }}
            />
          ) : (
            <>
              <div className="page-header task-page-header">
                <div>
                  <div className="eyebrow">
                    {task.code} · ສະບັບ {task.revision}
                  </div>
                  <h1>{task.title}</h1>
                  <p>
                    ສ້າງໂດຍ {task.owner.displayName} · {timeLabel(task.createdAt)}
                  </p>
                </div>
                <div className="task-actions">
                  <button className="button secondary" onClick={reload}>
                    ໂຫຼດໃໝ່
                  </button>
                  {task.permissions.edit && (
                    <button className="button primary" onClick={() => setEditing(true)}>
                      ແກ້ໄຂວຽກ
                    </button>
                  )}
                </div>
              </div>
              {failure && (
                <p role="alert" className="identity-error">
                  {failure}{" "}
                  <button
                    className="button secondary"
                    onClick={() => {
                      setFailure("");
                      reload();
                    }}
                  >
                    ໂຫຼດສະບັບຫຼ້າສຸດ
                  </button>
                </p>
              )}
              <div className="detail-grid">
                <div className="detail-main">
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>ລາຍລະອຽດ</h2>
                    </div>
                    <p className="task-description">{task.description || "ບໍ່ມີລາຍລະອຽດ"}</p>
                  </section>
                  {task.permissions.edit && (
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>ປ່ຽນສະຖານະ</h2>
                      </div>
                      <form className="identity-form" onSubmit={transition}>
                        <label>
                          ສະຖານະໃໝ່
                          <select
                            aria-label="ສະຖານະໃໝ່"
                            value={status}
                            onChange={(e) => setStatus(e.target.value as TaskStatus)}
                            disabled={busy}
                          >
                            {taskStatuses
                              .filter(
                                (s) =>
                                  !["done", "cancelled"].includes(task.status) ||
                                  s === task.status ||
                                  s === "todo",
                              )
                              .map((s) => (
                                <option key={s} value={s}>
                                  {statusNames[s]}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          ເຫດຜົນ
                          <input
                            value={reason}
                            maxLength={500}
                            onChange={(e) => setReason(e.target.value)}
                            disabled={busy}
                            required={
                              ["done", "cancelled"].includes(task.status) ||
                              ["blocked", "cancelled"].includes(status)
                            }
                          />
                        </label>
                        <p className="task-help">
                          ຕ້ອງລະບຸເຫດຜົນເມື່ອຕິດຂັດ, ຍົກເລີກ ຫຼື ເປີດວຽກຄືນ. ວຽກທີ່ປິດແລ້ວຈະເປີດຄືນເປັນລໍຖ້າດຳເນີນການ.
                        </p>
                        <button
                          className="button secondary"
                          type="submit"
                          disabled={busy || status === task.status}
                        >
                          {busy && <Skeleton variant="inline" label="ກຳລັງບັນທຶກ..." />}
                          {busy ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກສະຖານະ"}
                        </button>
                      </form>
                    </section>
                  )}
                  <TaskHistoryPanel key={task.id + ":" + task.revision} id={task.id} />
                </div>
                <aside className="detail-side">
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>ຂໍ້ມູນວຽກ</h2>
                    </div>
                    <dl className="detail-list">
                      <dt>ສະຖານະ</dt>
                      <dd>
                        <TaskBadge status={task.status} />
                      </dd>
                      <dt>ຜູ້ຮັບຜິດຊອບຫຼັກ</dt>
                      <dd>{task.assignee.displayName}</dd>
                      <dt>ມອບໝາຍໂດຍ</dt>
                      <dd>{task.assignedBy.displayName}</dd>
                      <dt>ຜູ້ຮ່ວມວຽກ</dt>
                      <dd>{task.collaborators.map((p) => p.displayName).join(", ") || "ບໍ່ມີ"}</dd>
                      <dt>ພະແນກ</dt>
                      <dd>{t(task.department.name)}</dd>
                      <dt>ຄວາມສຳຄັນ</dt>
                      <dd>{priorityNames[task.priority]}</dd>
                      <dt>ວັນຄົບກຳນົດ</dt>
                      <dd className={task.overdue ? "danger-text" : ""}>
                        {dueLabel(task.dueDate)}
                        {task.overdue ? " · ເກີນກຳນົດ" : ""}
                      </dd>
                      <dt>ແກ້ໄຂຫຼ້າສຸດ</dt>
                      <dd>{timeLabel(task.updatedAt)}</dd>
                    </dl>
                  </section>
                  {task.permissions.manageAccess && <TaskSharing id={id} onChanged={reload} />}
                  {task.permissions.manageAccess && (
                    <section className="panel">
                      <h2>ເກັບເຂົ້າຄັງ</h2>
                      <p className="task-help">ເອົາວຽກອອກຈາກລາຍການໃຊ້ງານ ໂດຍເກັບຂໍ້ມູນ ແລະ ປະຫວັດໄວ້.</p>
                      {archiveConfirm ? (
                        <div className="task-actions">
                          <button
                            className="button danger"
                            disabled={busy}
                            onClick={() => void archive()}
                          >
                            ຢືນຢັນເກັບເຂົ້າຄັງ
                          </button>
                          <button
                            className="button ghost"
                            disabled={busy}
                            onClick={() => setArchiveConfirm(false)}
                          >
                            ຍົກເລີກ
                          </button>
                        </div>
                      ) : (
                        <button className="button ghost" onClick={() => setArchiveConfirm(true)}>
                          ເກັບວຽກເຂົ້າຄັງ
                        </button>
                      )}
                    </section>
                  )}
                </aside>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
function TaskHistoryPanel({ id }: { id: string }) {
  const [cursors, setCursors] = useState<number[]>([]);
  const { data, error, loading, reload } = useTaskData(
    `/api/v1/tasks/${id}/history?limit=10${cursors.length ? "&before=" + cursors.at(-1) : ""}`,
    taskHistorySchema,
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>ປະຫວັດການປ່ຽນແປງ</h2>
      </div>
      <Feedback loading={loading} error={error} reload={reload} />
      {data && (
        <>
          <div className="task-history">
            {data.items.map((event) => (
              <article key={event.id}>
                <p>
                  <strong>{actionNames[event.action] ?? event.action}</strong> ·{" "}
                  {event.actor.displayName}
                </p>
                <small>
                  {timeLabel(event.occurredAt)} · ສະບັບ {event.revision}
                </small>
                {event.reason && <p className="task-description">{event.reason}</p>}
                <details>
                  <summary>ເບິ່ງຂໍ້ມູນໃນສະບັບນີ້</summary>
                  <dl className="detail-list">
                    <dt>ຫົວຂໍ້</dt>
                    <dd>{event.snapshot.title}</dd>
                    <dt>ລາຍລະອຽດ</dt>
                    <dd className="task-description">{event.snapshot.description || "—"}</dd>
                    <dt>ສະຖານະ</dt>
                    <dd>{statusNames[event.snapshot.status]}</dd>
                    <dt>ຜູ້ຮັບຜິດຊອບ</dt>
                    <dd>{event.snapshot.assignee.displayName}</dd>
                    <dt>ຜູ້ຮ່ວມວຽກ</dt>
                    <dd>
                      {event.snapshot.collaborators.map((p) => p.displayName).join(", ") || "—"}
                    </dd>
                    <dt>ຄວາມສຳຄັນ</dt>
                    <dd>{priorityNames[event.snapshot.priority]}</dd>
                    <dt>ຄົບກຳນົດ</dt>
                    <dd>{dueLabel(event.snapshot.dueDate)}</dd>
                  </dl>
                </details>
              </article>
            ))}
          </div>
          <div className="task-pagination">
            <button
              className="button secondary"
              disabled={!cursors.length}
              onClick={() => setCursors((old) => old.slice(0, -1))}
            >
              ໃໝ່ກວ່າ
            </button>
            <button
              className="button secondary"
              disabled={!data.nextBefore}
              onClick={() => setCursors((old) => [...old, data.nextBefore!])}
            >
              ເກົ່າກວ່າ
            </button>
          </div>
        </>
      )}
    </section>
  );
}
export { Dashboard as TaskDashboard } from "../dashboard/Dashboard";
