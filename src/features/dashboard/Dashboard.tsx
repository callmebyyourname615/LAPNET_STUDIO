import { useEffect, useId, useState } from "react";
import {
  ArrowUpRight,
  Plus,
  RefreshCw,
  CheckCheck,
  CalendarDays,
  Clock3,
  ListTodo,
  ChartNoAxesCombined,
} from "lucide-react";
import { dashboardSchema, type DashboardSummary, type TaskRecord } from "@lapnet/contracts";
import { useTaskData, statusNames, priorityNames, dueLabel, timeLabel } from "../tasks/api";
import { useAuth } from "../identity/Auth";
import { Skeleton } from "../../components/ui/skeleton";
import "./dashboard.css";

const number = (n: number) => new Intl.NumberFormat("lo-LA", { numberingSystem: "latn" }).format(n);
export function Dashboard({ go }: { go: (path: string) => void }) {
  const { me } = useAuth();
  const [view, setView] = useState<"mine" | "all">("mine"),
    [days, setDays] = useState(14);
  const { data, error, loading, refreshing, reload } = useTaskData(
    `/api/v1/tasks/dashboard?view=${view}&days=${days}`,
    dashboardSchema,
  );
  useEffect(() => {
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [reload]);
  const suffix = view === "mine" ? "&view=mine" : "";
  return (
    <div className="work-dashboard">
      <header className="dash-header">
        <div>
          <p className="dash-date">
            {new Intl.DateTimeFormat("lo-LA", {
              dateStyle: "full",
              calendar: "gregory",
              timeZone: "Asia/Vientiane",
            }).format(new Date())}
          </p>
          <h1>ພາບລວມການເຮັດວຽກ</h1>
          <p>
            ສະບາຍດີ, {me?.user.displayName}{" "}
            <span className="dash-muted">· ວຽກ ແລະ ຄວາມຄືບໜ້າໃນບ່ອນດຽວ</span>
          </p>
        </div>
        <div className="dash-actions">
          <button
            className="button secondary dash-refresh"
            onClick={reload}
            aria-label="ໂຫຼດ Dashboard ໃໝ່"
            disabled={loading || refreshing}
            aria-busy={refreshing}
          >
            <RefreshCw size={16} />
          </button>
          <button className="button primary" onClick={() => go("/tasks/new")}>
            <Plus size={16} />
            ສ້າງວຽກ
          </button>
        </div>
      </header>
      <div className="dash-toolbar">
        <div className="dash-scope" aria-label="ຂອບເຂດ Dashboard">
          <button aria-pressed={view === "mine"} onClick={() => setView("mine")}>
            ວຽກຂອງຂ້ອຍ
          </button>
          <button aria-pressed={view === "all"} onClick={() => setView("all")}>
            ທັງໝົດທີ່ມີສິດ
          </button>
        </div>
        <span className="dash-live">
          <span />
          ຂໍ້ມູນຈາກລະບົບ
        </span>
      </div>
      {error && data && (
        <div className="identity-error" role="alert">
          <p>ອັບເດດບໍ່ສຳເລັດ. ກຳລັງສະແດງຂໍ້ມູນທີ່ໂຫຼດໄວ້ຫຼ້າສຸດ.</p>
          <button className="button secondary" onClick={reload}>
            ລອງໃໝ່
          </button>
        </div>
      )}
      {loading ? (
        <Skeleton variant="dashboard" />
      ) : error && !data ? (
        <section className="dash-tile dash-error" role="alert">
          <h2>ບໍ່ສາມາດໂຫຼດພາບລວມໄດ້</h2>
          <p>{error}</p>
          <button className="button secondary" onClick={reload}>
            ລອງໃໝ່
          </button>
        </section>
      ) : (
        data && (
          <div className="dash-bento">
            <section className="dash-tile dash-overview">
              <div className="dash-tile-label">
                <ListTodo size={18} />
                ວຽກທີ່ກຳລັງເປີດ
              </div>
              <div className="dash-overview-line">
                <strong>{number(data.totals.active)}</strong>
                <span>ວຽກ</span>
              </div>
              <p>
                {view === "mine" ? "ວຽກທີ່ທ່ານຮັບຜິດຊອບ ແລະ ຮ່ວມດຳເນີນການ" : "ລາຍການວຽກໃນຂອບເຂດທີ່ທ່ານມີສິດເບິ່ງ"}
              </p>
              <div className="dash-overview-footer">
                <span>
                  {number(data.totals.total)} ວຽກທັງໝົດ · {number(data.totals.completed)} ສຳເລັດແລ້ວ
                </span>
                <button
                  onClick={() => go("/tasks?active=true" + suffix)}
                  aria-label="ເບິ່ງວຽກທີ່ກຳລັງເປີດ"
                >
                  <ArrowUpRight size={20} />
                </button>
              </div>
            </section>
            <Metric
              title="ຄົບກຳນົດມື້ນີ້"
              value={data.totals.dueToday}
              note="ວຽກທີ່ຕ້ອງຕິດຕາມມື້ນີ້"
              icon={<CalendarDays size={18} />}
              onClick={() => go("/tasks?due=today" + suffix)}
            />
            <Metric
              title="ເກີນກຳນົດ"
              value={data.totals.overdue}
              note="ວຽກເປີດທີ່ຜ່ານວັນກຳນົດ"
              icon={<Clock3 size={18} />}
              tone="danger"
              onClick={() => go("/tasks?state=overdue" + suffix)}
            />
            <section className="dash-tile dash-trend">
              <div className="dash-tile-head">
                <div>
                  <h2>ແນວໂນ້ມການເຮັດວຽກ</h2>
                  <p>ວຽກສ້າງໃໝ່ ແລະ ຄັ້ງທີ່ສຳເລັດໃນແຕ່ລະມື້</p>
                </div>
                <select
                  value={days}
                  aria-label="ຊ່ວງເວລາກຣາຟ"
                  onChange={(e) => setDays(Number(e.target.value))}
                >
                  <option value={14}>14 ມື້</option>
                  <option value={30}>30 ມື້</option>
                </select>
              </div>
              <TrendChart data={data.trend} />
            </section>
            <section className="dash-tile dash-distribution">
              <div className="dash-tile-head">
                <div>
                  <h2>ສັດສ່ວນສະຖານະ</h2>
                  <p>ສະຖານະວຽກປັດຈຸບັນ</p>
                </div>
                <CheckCheck size={18} />
              </div>
              <StatusChart data={data} go={go} suffix={suffix} />
            </section>
            <section className="dash-tile dash-upcoming">
              <div className="dash-tile-head">
                <div>
                  <h2>ວຽກທີ່ຄວນຕິດຕາມ</h2>
                  <p>ຈັດລຽງຕາມວັນຄົບກຳນົດ</p>
                </div>
                <button
                  className="dash-text-link"
                  onClick={() => go("/tasks?active=true" + suffix)}
                >
                  ເບິ່ງວຽກ
                  <ArrowUpRight size={15} />
                </button>
              </div>
              <TaskRows tasks={data.upcoming} go={go} empty="ບໍ່ມີວຽກເປີດທີ່ກຳນົດວັນຄົບກຳນົດ" />
            </section>
            <section className="dash-tile dash-priorities">
              <div className="dash-tile-head">
                <div>
                  <h2>ຄວາມສຳຄັນ</h2>
                  <p>ສະເພາະວຽກທີ່ກຳລັງເປີດ</p>
                </div>
                <ChartNoAxesCombined size={18} />
              </div>
              <div className="dash-bars">
                {[...data.priorities].reverse().map((row) => (
                  <button
                    key={row.priority}
                    onClick={() => go("/tasks?active=true&priority=" + row.priority + suffix)}
                  >
                    <span>
                      {priorityNames[row.priority]}
                      <strong>{number(row.count)}</strong>
                    </span>
                    <i className="dash-bar-track">
                      <i
                        style={{
                          transform: `scaleX(${row.count / Math.max(...data.priorities.map((p) => p.count), 1)})`,
                        }}
                      />
                    </i>
                  </button>
                ))}
              </div>
            </section>
            <section className="dash-tile dash-recent">
              <div className="dash-tile-head">
                <div>
                  <h2>ອັບເດດຫຼ້າສຸດ</h2>
                  <p>ລາຍການທີ່ມີການປ່ຽນແປງຫຼ້າສຸດ</p>
                </div>
                <button
                  className="dash-text-link"
                  onClick={() => go("/tasks?" + (view === "mine" ? "view=mine" : ""))}
                >
                  ທັງໝົດ
                  <ArrowUpRight size={15} />
                </button>
              </div>
              <TaskRows tasks={data.recent} go={go} empty="ຍັງບໍ່ມີວຽກໃນຂອບເຂດນີ້" recent />
            </section>
          </div>
        )
      )}
      {data && !loading && !error && (
        <p className="dash-footer">
          ອັບເດດ {timeLabel(data.asOf)} · ເວລາ Asia/Vientiane · ສະແດງສະເພາະລາຍການທີ່ມີສິດ
        </p>
      )}
    </div>
  );
}
function Metric({
  title,
  value,
  note,
  icon,
  onClick,
  tone = "default",
}: {
  title: string;
  value: number;
  note: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button className={"dash-tile dash-metric dash-tone-" + tone} onClick={onClick}>
      <span className="dash-tile-label">
        {icon}
        {title}
        <ArrowUpRight size={16} />
      </span>
      <strong>{number(value)}</strong>
      <span>{note}</span>
    </button>
  );
}
function TaskRows({
  tasks,
  go,
  empty,
  recent = false,
}: {
  tasks: TaskRecord[];
  go: (path: string) => void;
  empty: string;
  recent?: boolean;
}) {
  return tasks.length ? (
    <div className="dash-task-list">
      {tasks.map((task) => (
        <button key={task.id} onClick={() => go("/tasks/" + task.id)}>
          <span className={"dash-task-marker dash-status-" + task.status} />
          <span className="dash-task-name">
            <small>
              {task.code} · {task.department.name}
            </small>
            <strong>{task.title}</strong>
            <span>{task.assignee.displayName}</span>
          </span>
          <span className="dash-task-meta">
            <span className={"dash-pill dash-status-" + task.status}>
              {statusNames[task.status]}
            </span>
            <small className={task.overdue ? "dash-danger" : ""}>
              {recent ? timeLabel(task.updatedAt) : dueLabel(task.dueDate)}
            </small>
          </span>
          <ArrowUpRight size={16} />
        </button>
      ))}
    </div>
  ) : (
    <div className="dash-empty">
      <ListTodo size={26} />
      <p>{empty}</p>
    </div>
  );
}
function StatusChart({
  data,
  go,
  suffix,
}: {
  data: DashboardSummary;
  go: (path: string) => void;
  suffix: string;
}) {
  let offset = 0;
  const segments = data.statuses.map((row) => {
    const start = offset;
    offset += (row.count / Math.max(data.totals.total, 1)) * 100;
    return `var(--dash-${row.status}) ${start}% ${offset}%`;
  });
  const completion = data.totals.total
    ? Math.round((data.totals.completed / data.totals.total) * 100)
    : 0;
  return (
    <>
      <div
        className="dash-donut"
        role="img"
        aria-label={`ສຳເລັດ ${completion}% ຈາກ ${data.totals.total} ວຽກ`}
        style={{
          background: data.totals.total
            ? `conic-gradient(${segments.join(",")})`
            : "var(--dash-track)",
        }}
      >
        <div>
          <strong>
            {completion}
            <small>%</small>
          </strong>
          <span>ສຳເລັດແລ້ວ</span>
        </div>
      </div>
      <div className="dash-status-legend">
        {data.statuses.map((row) => (
          <button key={row.status} onClick={() => go("/tasks?status=" + row.status + suffix)}>
            <i className={"dash-status-" + row.status} />
            <span>{statusNames[row.status]}</span>
            <strong>{number(row.count)}</strong>
          </button>
        ))}
      </div>
    </>
  );
}
function TrendChart({ data }: { data: DashboardSummary["trend"] }) {
  const [selected, setSelected] = useState<number | null>(null),
    id = useId();
  const width = 640,
    height = 210,
    pad = 24,
    max = Math.max(1, ...data.flatMap((x) => [x.created, x.completed]));
  const point = (i: number, n: number) => ({
    x: pad + (i * (width - pad * 2)) / (data.length - 1),
    y: height - pad - (n / max) * (height - pad * 2),
  });
  const path = (key: "created" | "completed") =>
    data
      .map((row, i) => {
        const p = point(i, row[key]);
        return `${i ? "L" : "M"}${p.x},${p.y}`;
      })
      .join(" ");
  const active = selected === null ? null : data[selected];
  return (
    <>
      <div className="dash-chart-legend">
        <span>
          <i />
          ສ້າງໃໝ່
        </span>
        <span>
          <i />
          ສຳເລັດ
        </span>
        <span className="dash-chart-readout" aria-live="polite">
          {active
            ? `${active.date} · ${active.created} / ${active.completed}`
            : "ວາງເມົາສ໌ ຫຼື Tab ເພື່ອເບິ່ງຂໍ້ມູນ"}
        </span>
      </div>
      <svg
        className="dash-line-chart"
        viewBox={`0 0 ${width} ${height}`}
        aria-labelledby={id}
        role="group"
      >
        <title id={id}>ວຽກສ້າງໃໝ່ ແລະ ການສຳເລັດລາຍມື້</title>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={pad}
              x2={width - pad}
              y1={point(0, max * f).y}
              y2={point(0, max * f).y}
              className="dash-chart-grid"
            />
            <text x={4} y={point(0, max * f).y + 4}>
              {number(Math.ceil(max * f))}
            </text>
          </g>
        ))}
        <path d={path("created")} className="dash-series-created" />
        <path d={path("completed")} className="dash-series-completed" />
        {data.map((row, i) => {
          const p = point(i, row.created);
          return (
            <circle
              key={row.date}
              cx={p.x}
              cy={p.y}
              r={5}
              tabIndex={0}
              role="img"
              aria-label={`${row.date}: ສ້າງ ${row.created}, ສຳເລັດ ${row.completed}`}
              onFocus={() => setSelected(i)}
              onBlur={() => setSelected(null)}
              onMouseEnter={() => setSelected(i)}
              onMouseLeave={() => setSelected(null)}
            />
          );
        })}
      </svg>
      <div className="dash-chart-dates">
        <span>{dueLabel(data[0]?.date ?? null)}</span>
        <span>{dueLabel(data.at(-1)?.date ?? null)}</span>
      </div>
      <details className="dash-chart-table">
        <summary>ເບິ່ງຂໍ້ມູນກຣາຟເປັນຕາຕະລາງ</summary>
        <table>
          <thead>
            <tr>
              <th>ວັນທີ</th>
              <th>ສ້າງໃໝ່</th>
              <th>ສຳເລັດ</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.date}>
                <td>{row.date}</td>
                <td>{row.created}</td>
                <td>{row.completed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
