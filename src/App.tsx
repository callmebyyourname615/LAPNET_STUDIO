import { NotificationBell, NOTIFICATIONS_CHANGED } from "./features/notifications/NotificationCenter";
import {notificationsSchema} from '@lapnet/contracts';
import {useTaskData} from './features/tasks/api';
import { Skeleton } from "./components/ui/skeleton";
import { InstallAppButton } from "./components/ui/install-app";
import { ProfileMenu } from "./components/ui/profile-menu";
import { AccountAvatar } from "./components/ui/account-avatar";
import { usePageAudit } from "./features/identity/use-page-audit";
import {t,tNode} from './i18n/lo';
import { useEffect, useMemo, useRef, useState,lazy,Suspense, type FormEvent, type ReactNode } from "react";
import {Authentication,useAuth,PasswordChange} from './features/identity/Auth';
import { useLocation, useNavigate } from 'react-router-dom';
import GlimmAutopilot, { isDocumentWorkspace, usePlatformTransition } from './components/ui/glimm-autopilot';
const PortalRecords=lazy(()=>import('./features/portal/Records').then(m=>({default:m.Records})));
const PortalSearch=lazy(()=>import('./features/portal/Discovery').then(m=>({default:m.SearchPage})));
const PortalNotifications=lazy(()=>import('./features/portal/Discovery').then(m=>({default:m.NotificationPage})));
const ConnectedTasks=lazy(()=>import('./features/tasks/Tasks').then(module=>({default:module.ConnectedTasks})));
const TaskDashboard=lazy(()=>import('./features/tasks/Tasks').then(module=>({default:module.TaskDashboard})));
const IdentityAdmin=lazy(()=>import('./features/identity/Admin').then(module=>({default:module.IdentityAdmin})));
const SettingsPage=lazy(()=>import('./features/identity/Settings'));
const TaskMemberProfile=lazy(()=>import('./features/identity/Settings').then(m=>({default:m.TaskMemberProfile})));
const AuditLogs=lazy(()=>import('./features/identity/AuditLogs'));
const DocumentWorkspace=lazy(()=>import('./features/document-workspace/Workspace'));

type TaskState = "To do" | "In progress" | "Blocked" | "Done" | "Cancelled";
type Task = {
  id: string;
  title: string;
  state: TaskState;
  due: string;
  assignee: string;
  department: string;
  company?: string;
  collaborators: string[];
};

const tasksSeed: Task[] = [
  {
    id: "TSK-1048",
    title: "Confirm technical requirements",
    state: "In progress",
    due: "2026-11-10",
    assignee: "Nila Phommasone",
    department: "IT",
    company: "Company A",
    collaborators: ["Kiet Vong", "Maya Chen"],
  },
  {
    id: "TSK-1043",
    title: "Review commercial details",
    state: "Blocked",
    due: "2026-11-09",
    assignee: "Maya Chen",
    department: "Finance",
    company: "Company A",
    collaborators: ["Nila Phommasone"],
  },
  {
    id: "TSK-1039",
    title: "Register response document",
    state: "To do",
    due: "2026-11-09",
    assignee: "You",
    department: "Office",
    company: "Company A",
    collaborators: ["Maya Chen"],
  },
  {
    id: "TSK-1034",
    title: "Audit Q4 access sample",
    state: "To do",
    due: "2026-11-12",
    assignee: "Somchai Lee",
    department: "Audit",
    collaborators: [],
  },
  {
    id: "TSK-1027",
    title: "Prepare visit summary",
    state: "Done",
    due: "2026-11-09",
    assignee: "You",
    department: "Office",
    company: "Company A",
    collaborators: ["Nila Phommasone"],
  },
];

const navGroups = [
  {
    label: "Work",
    items: [
      ["/dashboard", "Dashboard", "grid"],
      ["/feed", "Work Feed", "feed"],
      ["/tasks", "My Tasks", "check"],
    ],
  },
  {
    label: "Records",
    items: [
      ["/documents", "Documents", "file"],
      ["/companies", "Companies", "building"],
    ],
  },
  { label: "Workspace", items: [["/notifications", "Notifications", "bell"]] },
  {
    label: "Administration",
    items: [
      ["/admin/people", "People", "users"],
      ["/admin/departments", "Departments", "org"],
      ["/admin/access", "Access", "lock"],
      ["/admin/audit", "ປະຫວັດການໃຊ້ງານ", "feed"],
    ],
  },
];

const iconPaths: Record<string, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  feed: (
    <>
      <path d="M5 6h14M5 12h14M5 18h9" />
      <circle cx="19" cy="18" r="2" />
    </>
  ),
  check: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="m8 12 3 3 6-7" />
    </>
  ),
  file: (
    <>
      <path d="M6 2h8l4 4v16H6z" />
      <path d="M14 2v5h5M9 12h6M9 16h6" />
    </>
  ),
  building: (
    <>
      <path d="M4 22V5l8-3 8 3v17M2 22h20M8 8h1M15 8h1M8 12h1M15 12h1M8 16h1M15 16h1" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  org: (
    <>
      <rect x="8" y="2" width="8" height="5" rx="1" />
      <rect x="2" y="17" width="8" height="5" rx="1" />
      <rect x="14" y="17" width="8" height="5" rx="1" />
      <path d="M12 7v5M6 17v-5h12v5" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  arrow: <path d="m9 18 6-6-6-6" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  filter: <path d="M4 5h16l-6 7v5l-4 2v-7z" />,
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7-7.1l-1.1 1" />
      <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1-1" />
    </>
  ),
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {tNode(iconPaths[name])}
    </svg>
  );
}

function Status({ children, tone }: { children: ReactNode; tone?: string }) {
  const label=['Done','Available','Blocked','Pending','Scanning','Overdue','Scan failed','Rejected','In progress','Received'].find(key=>t(key)===String(children))??String(children);
  const inferred =
    tone ||
    (label.match(/Done|Available|success/i)
      ? "success"
      : label.match(/Blocked|Pending|Scanning/i)
        ? "warning"
        : label.match(/Overdue|failed|Rejected/i)
          ? "danger"
          : label.match(/progress|Received/i)
            ? "info"
            : "neutral");
  return (
    <span className={`status ${inferred}`}>
      <span className="status-dot" />
      {tNode(children)}
    </span>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{tNode(children)}</section>;
}

function Avatar({ initials = "YP", small = false }: { initials?: string; small?: boolean }) {
  return <span className={`avatar ${small ? "small" : ""}`}>{tNode(initials)}</span>;
}

function AppButton({
  children,
  onClick,
  variant = "secondary",
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button type={type} className={`button ${variant}`} onClick={onClick} disabled={disabled}>
      {tNode(children)}
    </button>
  );
}

function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDue(value: string) {
  return new Intl.DateTimeFormat("lo-LA", {
    day: "2-digit", month: "short", year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function activeTask(task: Task) {
  return task.state !== "Done" && task.state !== "Cancelled";
}

function overdueTask(task: Task) {
  return activeTask(task) && task.due < todayDate();
}

function usePath() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname === "/" ? "/dashboard" : location.pathname + location.search;
  const go = (next: string) => {
    navigate(next);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return { path, go };
}

function Sidebar({
  path,
  go,
  open,
  close,
  unread,
}: {
  path: string;
  go: (p: string) => void;
  open: boolean;
  close: () => void;
  unread?: number;
}) {
  const {me,preview}=useAuth();
  return (
    <>
      {open && <button className="sidebar-scrim" aria-label={t("Close navigation")} onClick={close} />}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-logo">
            <img src="/branding/lapnet-studio-original.png" alt="LAPNet Studio" width="2172" height="724" />
          </span>
        </div>
        <nav aria-label={t("Primary")}>
          {tNode(navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{tNode(group.label)}</div>
              {tNode(group.items.map(([href, label, icon]) => {
                if(href==='/admin/people'&&!me?.capabilities.manageUsers&&!preview)return null;
                if(href==='/admin/audit'&&!me?.capabilities.viewAudit)return null;
                const active =
                  path === href || (href !== "/dashboard" && path.startsWith(href + "/"));
                return (
                  <button
                    title={label}
                    className={`nav-item ${active ? "active" : ""}`}
                    key={href}
                    onClick={() => {
                      go(href);
                      close();
                    }}
                  >
                    <Icon name={icon} />
                    <span>{tNode(label)}</span>
                    {label === "Notifications" && (unread === undefined ? <Skeleton variant="inline" /> : unread > 0 ? <b>{unread}</b> : null)}
                  </button>
                );
              }))}
            </div>
          )))}
        </nav>
        <button className="sidebar-user" onClick={()=>{go('/settings');close();}} aria-label="ບັນຊີຂອງຂ້ອຍ">
          <AccountAvatar />
          <div>
            <strong>{tNode(me?.user.displayName)}</strong>
            <span>{tNode(me?.memberships.map(x=>x.department.name).join(' · ')||'ບັນຊີຂອງຂ້ອຍ')}</span>
          </div>
          <Icon name="more" />
        </button>
      </aside>
    </>
  );
}

function PlatformSwitcher() {
  const { platform, busy, error, switchTo } = usePlatformTransition();
  return (
    <div className="platform-switcher-wrap">
    <div className="platform-switcher" data-platform={platform} data-state={error ? "error" : undefined} role="group" aria-label="ສະຫຼັບລະບົບ" aria-busy={busy}>
      <span className="platform-switcher-slider" aria-hidden="true" />
      <button type="button" disabled={busy} aria-pressed={platform === "portal"} onClick={event => switchTo("portal", event.currentTarget)}>
        <Icon name="grid" size={17} />
        <span>Portal</span>
      </button>
      <button type="button" disabled={busy} aria-pressed={platform === "document"} onClick={event => switchTo("document", event.currentTarget)}>
        <Icon name="file" size={17} />
        <span>Document</span>
      </button>
    </div>
    {error && <p className="platform-switcher-error" role="alert">{error}</p>}
    </div>
  );
}

function PortalHeaderActions({ go, unread }: { go: (path: string) => void; unread?: number }) {
  const { me } = useAuth();
  return (
    <div className="top-actions">
        <InstallAppButton />
        {me?.capabilities.viewAudit && <button className="icon-button" style={{display:"grid"}} aria-label="Audit Logs" title="ປະຫວັດການໃຊ້ງານ" onClick={()=>go('/admin/audit')}><Icon name="feed" /></button>}
        <button className="icon-button" aria-label={t("Search")} onClick={()=>go("/search")}>
          <Icon name="search" />
        </button>
        <NotificationBell go={go} unread={unread} />
        <ProfileMenu go={go}><button className="user-chip" aria-label="ບັນຊີຂອງຂ້ອຍ">
          <AccountAvatar small />
          <span>{me?.user.displayName}</span>
        </button></ProfileMenu>
      </div>
  );
}

function Topbar({
  title,
  openMenu,
  go,
  unread,
}: {
  title: string;
  openMenu: () => void;
  go: (p: string) => void;
  unread?: number;
}) {
  return (
    <header className="topbar">
      <button className="mobile-menu" aria-label={t("Open navigation")} onClick={openMenu}>
        <Icon name="menu" />
      </button>
      <div className="crumb">
        <span>{t("LAPNet Studio")}</span>
        <Icon name="arrow" size={14} />
        <strong>{tNode(title)}</strong>
      </div>
      <PlatformSwitcher />
      <PortalHeaderActions go={go} unread={unread} />
    </header>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {tNode(eyebrow && <div className="eyebrow">{tNode(eyebrow)}</div>)}
        <h1>{tNode(title)}</h1>
        {tNode(description && <p>{tNode(description)}</p>)}
      </div>
      {tNode(action && <div className="page-action">{tNode(action)}</div>)}
    </div>
  );
}

function Dashboard({ go, openNew, tasks }: { go: (p: string) => void; openNew: () => void; tasks: Task[] }) {
  const {me}=useAuth();
  const active = tasks.filter(activeTask);
  const metrics = [
    ["Open work", String(active.length), `Across ${new Set(active.map((task) => task.department)).size} departments`, "/tasks"],
    ["Due today", String(active.filter((task) => task.due === todayDate()).length), "Active work due today", "/tasks?due=today"],
    ["Overdue", String(tasks.filter(overdueTask).length), "Needs attention", "/tasks?state=overdue"],
    ["Documents processing", "2", "1 requires recovery", "/documents"],
  ];
  return (
    <>
      <PageHeader
        eyebrow={`${new Intl.DateTimeFormat("lo-LA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()).toUpperCase()} · ທົດລອງ`}
        title={`ສະບາຍດີ, ${me?.user.displayName??''}`}
        description={t("Here’s the work that needs your attention today.")}
        action={
          <AppButton variant="primary" onClick={openNew}>
            <Icon name="plus" />{t("New task")}</AppButton>
        }
      />
      <div className="metric-grid">
        {tNode(metrics.map(([label, value, note, href]) => (
          <button className="metric-card" key={label} onClick={() => go(href)}>
            <div className="metric-label">
              {tNode(label)}
              <Icon name="arrow" size={16} />
            </div>
            <strong>{tNode(value)}</strong>
            <span className={label === "Overdue" ? "danger-text" : ""}>{tNode(note)}</span>
          </button>
        )))}
      </div>
      <div className="dashboard-grid">
        <Panel className="task-panel">
          <PanelHeading
            title={t("Priority work")}
            meta={`${active.length} active tasks`}
            action={
              <button className="text-button" onClick={() => go("/tasks")}>{t("View all")}<Icon name="arrow" size={14} />
              </button>
            }
          />
          <div className="data-list">
            {tNode(active.slice(0, 4).map((task) => (
              <button className="task-row" key={task.id} onClick={() => go(`/tasks/${task.id}`)}>
                <span className={`task-check ${task.state === "Done" ? "checked" : ""}`}>
                  {tNode(task.state === "Done" && "✓")}
                </span>
                <span className="task-main">
                  <strong>{tNode(task.title)}</strong>
                  <span>
                    {tNode(task.id)} · {tNode(task.department)}
                    {tNode(task.company ? ` · ${task.company}` : "")}
                  </span>
                </span>
                <Status>{task.state}</Status>
                <span className={overdueTask(task) ? "due overdue" : "due"}>{tNode(formatDue(task.due))}</span>
                <Avatar
                  initials={
                    task.assignee === "You"
                      ? "YP"
                      : task.assignee
                          .split(" ")
                          .map((v) => v[0])
                          .join("")
                  }
                  small
                />
              </button>
            )))}
          </div>
        </Panel>
        <Panel className="activity-panel">
          <PanelHeading title={t("Company activity")} meta={t("Latest permitted records")} />
          <div className="activity-list">
            <button onClick={() => go("/companies/company-a")}>
              <span className="activity-icon">
                <Icon name="building" />
              </span>
              <span>
                <strong>{t("Company A visit recorded")}</strong>
                <small>{t("Occurred 08/11 · recorded 09/11")}</small>
              </span>
              <Icon name="arrow" />
            </button>
            <button onClick={() => go("/documents/DOC-2026-184")}>
              <span className="activity-icon">
                <Icon name="file" />
              </span>
              <span>
                <strong>{t("Proposal v2 available")}</strong>
                <small>{t("Received · Company A")}</small>
              </span>
              <Icon name="arrow" />
            </button>
            <button onClick={() => go("/companies/company-b")}>
              <span className="activity-icon">
                <Icon name="clock" />
              </span>
              <span>
                <strong>{t("Company B call")}</strong>
                <small>{t("Follow-up planned for tomorrow")}</small>
              </span>
              <Icon name="arrow" />
            </button>
          </div>
          <div className="scope-note">
            <Icon name="lock" />
            <span>{t("Activity only includes records within your current scope.")}</span>
          </div>
        </Panel>
      </div>
      <Panel>
        <PanelHeading title={t("Recent records")} meta={t("Documents and interactions")} />
        <div className="records-grid">
          <Record
            icon="file"
            title={t("Service proposal — Company A")}
            meta={t("REG-2026-0184 · v2 · Available")}
            badge="Received"
            onClick={() => go("/documents/DOC-2026-184")}
          />
          <Record
            icon="feed"
            title={t("On-site requirements meeting")}
            meta={t("Company A · 08/11/2026")}
            badge="Interaction"
            onClick={() => go("/companies/company-a")}
          />
          <Record
            icon="file"
            title={t("Response to proposal")}
            meta={t("REG-2026-0185 · v1 · Scanning")}
            badge="Sent"
            onClick={() => go("/documents/DOC-2026-185")}
          />
        </div>
      </Panel>
    </>
  );
}

function PanelHeading({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{tNode(title)}</h2>
        {tNode(meta && <span>{tNode(meta)}</span>)}
      </div>
      {tNode(action)}
    </div>
  );
}

function Record({
  icon,
  title,
  meta,
  badge,
  onClick,
}: {
  icon: string;
  title: string;
  meta: string;
  badge: string;
  onClick: () => void;
}) {
  return (
    <button className="record-card" onClick={onClick}>
      <span className="record-icon">
        <Icon name={icon} />
      </span>
      <span>
        <strong>{tNode(title)}</strong>
        <small>{tNode(meta)}</small>
      </span>
      <Status tone="neutral">{badge}</Status>
    </button>
  );
}

function SearchFilters({
  value,
  setValue,
  children,
}: {
  value: string;
  setValue: (s: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="filters">
      <label className="search-box">
        <Icon name="search" />
        <span className="sr-only">{t("Search")}</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("Search records…")}
        />
      </label>
      {tNode(children)}
    </div>
  );
}

function Tasks({
  tasks,
  setTasks,
  go,
  openNew,
  query,
}: {
  tasks: Task[];
  setTasks: (t: Task[]) => void;
  go: (p: string) => void;
  openNew: () => void;
  query: string;
}) {
  const params = new URLSearchParams(query);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("All states");
  const [department, setDepartment] = useState("All departments");
  const [due, setDue] = useState(params.get("due") === "today" ? "Due today" : params.get("state") === "overdue" ? "Overdue" : "Any due date");
  const shown = tasks.filter(
    (t) =>
      [t.title, t.id, t.company || "", t.department, t.assignee].join(" ").toLowerCase().includes(search.toLowerCase()) &&
      (state === "All states" || t.state === state) &&
      (department === "All departments" || t.department === department) &&
      (due === "Any due date" || (due === "Due today" ? activeTask(t) && t.due === todayDate() : overdueTask(t))),
  );
  return (
    <>
      <PageHeader
        title={t("My tasks")}
        description={t("Assignments and collaborations within your current scope.")}
        action={
          <AppButton variant="primary" onClick={openNew}>
            <Icon name="plus" />{t("New task")}</AppButton>
        }
      />
      <Panel>
        <SearchFilters value={search} setValue={setSearch}>
          <label className="select-wrap">
            <span className="sr-only">{t("Filter by state")}</span>
            <select value={state} onChange={(e) => setState(e.target.value)}>
              <option value="All states">{t("All states")}</option>
              <option value="To do">{t("To do")}</option>
              <option value="In progress">{t("In progress")}</option>
              <option value="Blocked">{t("Blocked")}</option>
              <option value="Done">{t("Done")}</option>
              <option value="Cancelled">{t("Cancelled")}</option>
            </select>
          </label>
          <select aria-label={t("Department filter")} value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="All departments">{t("All departments")}</option>
            <option value="Office">{t("Office")}</option>
            <option value="Finance">{t("Finance")}</option>
            <option value="IT">{t("IT")}</option>
            <option value="Operation">{t("Operation")}</option>
            <option value="Audit">{t("Audit")}</option>
          </select>
          <select aria-label={t("Due date filter")} value={due} onChange={(e) => setDue(e.target.value)}>
            <option value="Any due date">{t("Any due date")}</option>
            <option value="Due today">{t("Due today")}</option>
            <option value="Overdue">{t("Overdue")}</option>
          </select>
        </SearchFilters>
        <div className="table-wrap">
          <div className="table task-table">
            <div className="table-head">
              <span>{t("Task")}</span>
              <span>{t("Status")}</span>
              <span>{t("Assignee")}</span>
              <span>{t("Department")}</span>
              <span>{t("Due")}</span>
            </div>
            {tNode(shown.map((task) => (
              <button className="table-row" key={task.id} onClick={() => go(`/tasks/${task.id}`)}>
                <span>
                  <strong>{tNode(task.title)}</strong>
                  <small>
                    {tNode(task.id)}
                    {tNode(task.company ? ` · ${task.company}` : "")}
                  </small>
                </span>
                <Status>{task.state}</Status>
                <span>{tNode(task.assignee)}</span>
                <span>{tNode(task.department)}</span>
                <span>{tNode(formatDue(task.due))}</span>
              </button>
            )))}
          </div>
        </div>
        {!shown.length && (
          <Empty
            title={t("No matching tasks")}
            text={t("Try removing a filter or searching for another task.")}
          />
        )}
      </Panel>
      <div className="local-note">{t("Changes in this prototype stay in this browser session and are not saved to a server.")}</div>
    </>
  );
}

function TaskDetail({
  task,
  go,
  update,
}: {
  task?: Task;
  go: (p: string) => void;
  update: (s: TaskState) => void;
}) {
  if (!task) return <Unavailable go={go} />;
  return (
    <>
      <button className="back-link" onClick={() => go("/tasks")}>{t("← Back to tasks")}</button>
      <PageHeader
        eyebrow={`${task.id} · SYNTHETIC RECORD`}
        title={task.title}
        description={`Related to ${task.company || "internal operations"}`}
        action={
          <select
            aria-label={t("Update status")}
            value={task.state}
            onChange={(e) => update(e.target.value as TaskState)}
          >
            <option value="To do">{t("To do")}</option>
            <option value="In progress">{t("In progress")}</option>
            <option value="Blocked">{t("Blocked")}</option>
            <option value="Done">{t("Done")}</option>
            <option value="Cancelled">{t("Cancelled")}</option>
          </select>
        }
      />
      <div className="detail-grid">
        <div className="detail-main">
          <Panel>
            <PanelHeading title={t("Description")} />
            <p className="reading">{t("Confirm the integration, security, and data migration requirements discussed during the Company A visit. Capture any open questions before the commercial review is completed.")}</p>
            <div className="callout info">
              <Icon name="feed" />
              <span>
                <strong>{t("Mention is awareness, not assignment.")}</strong>{t("@Finance was notified about this task. Access and approval were not changed.")}</span>
            </div>
          </Panel>
          <Panel>
            <PanelHeading
              title={t("Linked documents")}
              meta={t("References only — files are not duplicated")}
            />
            <Record
              icon="file"
              title={t("Service proposal — Company A")}
              meta={t("REG-2026-0184 · v2 · Available")}
              badge="Permitted"
              onClick={() => go("/documents/DOC-2026-184")}
            />
          </Panel>
          <Panel>
            <PanelHeading title={t("Comments & history")} meta={t("3 events")} />
            <div className="timeline compact">
              <TimelineItem
                date="09 Nov, 10:32"
                title={t("Nila moved task to In progress")}
                text={t("Local demo status update.")}
              />
              <TimelineItem
                date="09 Nov, 09:18"
                title={t("Maya Chen added as collaborator")}
                text={t("Collaboration does not change the primary assignee.")}
              />
              <TimelineItem
                date="08 Nov, 16:40"
                title={t("Task created from interaction")}
                text={t("Created after the on-site requirements meeting.")}
              />
            </div>
          </Panel>
        </div>
        <aside className="detail-side">
          <Panel>
            <PanelHeading title={t("Task details")} />
            <dl className="detail-list">
              <dt>{t("Status")}</dt>
              <dd>
                <Status>{task.state}</Status>
              </dd>
              <dt>{t("Primary assignee")}</dt>
              <dd>
                <Avatar initials="NP" small /> {tNode(task.assignee)}
              </dd>
              <dt>{t("Collaborators")}</dt>
              <dd>{tNode(task.collaborators.join(", ") || "None")}</dd>
              <dt>{t("Due date")}</dt>
              <dd>{tNode(formatDue(task.due))}</dd>
              <dt>{t("Department")}</dt>
              <dd>{tNode(task.department)}</dd>
              <dt>{t("Company")}</dt>
              <dd>
                <button className="inline-link" onClick={() => go("/companies/company-a")}>
                  {tNode(task.company || "—")}
                </button>
              </dd>
            </dl>
          </Panel>
        </aside>
      </div>
    </>
  );
}

function Documents({ go }: { go: (p: string) => void }) {
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("All directions");
  const [fileState, setFileState] = useState("All file states");
  const docs = [
    [
      "DOC-2026-184",
      "Service proposal — Company A",
      "REG-2026-0184",
      "PROP-A-0711",
      "Company A",
      "Received",
      "07/11/2026",
      "08/11/2026",
      "Finance",
      "v2",
      "Available",
    ],
    [
      "DOC-2026-185",
      "Response to proposal",
      "REG-2026-0185",
      "RESP-2026-44",
      "Company A",
      "Sent",
      "09/11/2026",
      "09/11/2026",
      "Office",
      "v1",
      "Scanning",
    ],
    [
      "DOC-2026-179",
      "Vendor compliance form",
      "REG-2026-0179",
      "VCF-992",
      "Company B",
      "Received",
      "04/11/2026",
      "05/11/2026",
      "Operation",
      "v1",
      "Scan failed",
    ],
  ].filter((d) => d.join(" ").toLowerCase().includes(search.toLowerCase()) &&
    (direction === "All directions" || d[5] === direction) &&
    (fileState === "All file states" || d[10] === fileState));
  return (
    <>
      <PageHeader
        title={t("Document center")}
        description={t("Registry records, movements, and immutable file versions.")}
        action={
          <AppButton variant="primary">
            <Icon name="plus" />{t("Register document")}</AppButton>
        }
      />
      <Panel>
        <SearchFilters value={search} setValue={setSearch}>
          <select aria-label={t("Direction")} value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="All directions">{t("All directions")}</option>
            <option value="Received">{t("Received")}</option>
            <option value="Sent">{t("Sent")}</option>
          </select>
          <select aria-label={t("File state")} value={fileState} onChange={(e) => setFileState(e.target.value)}>
            <option value="All file states">{t("All file states")}</option>
            <option value="Available">{t("Available")}</option>
            <option value="Scanning">{t("Scanning")}</option>
            <option value="Scan failed">{t("Scan failed")}</option>
          </select>
        </SearchFilters>
        <div className="table-wrap">
          <div className="table document-table">
            <div className="table-head">
              <span>{t("Document")}</span>
              <span>{t("Company")}</span>
              <span>{t("Direction")}</span>
              <span>{t("Issue date")}</span>
              <span>{t("Movement")}</span>
              <span>{t("Owner")}</span>
              <span>{t("Version")}</span>
              <span>{t("File")}</span>
            </div>
            {tNode(docs.map((d) => (
              <button className="table-row" key={d[0]} onClick={() => go(`/documents/${d[0]}`)}>
                <span>
                  <strong>{tNode(d[1])}</strong>
                  <small>
                    {tNode(d[2])}{t("· Ext.")}{tNode(d[3])}
                  </small>
                </span>
                <span>{tNode(d[4])}</span>
                <Status tone="neutral">{d[5]}</Status>
                <span>{tNode(d[6])}</span>
                <span>{tNode(d[7])}</span>
                <span>{tNode(d[8])}</span>
                <span>{tNode(d[9])}</span>
                <Status>{d[10]}</Status>
              </button>
            )))}
          </div>
        </div>
        {!docs.length && <Empty title={t("No matching documents")} text={t("Try another search or clear the selected filters.")} />}
      </Panel>
    </>
  );
}

function DocumentDetail({ id, go }: { id: string; go: (p: string) => void }) {
  const failed = id === "DOC-2026-179";
  const scanning = id === "DOC-2026-185";
  const title = failed
    ? "Vendor compliance form"
    : scanning
      ? "Response to proposal"
      : "Service proposal — Company A";
  return (
    <>
      <button className="back-link" onClick={() => go("/documents")}>{t("← Back to documents")}</button>
      <PageHeader
        eyebrow={t("SYNTHETIC DOCUMENT RECORD")}
        title={title}
        description={
          failed
            ? "REG-2026-0179 · Company B"
            : scanning
              ? "REG-2026-0185 · Company A"
              : "REG-2026-0184 · Company A"
        }
        action={
          <AppButton variant="primary" disabled={failed || scanning}>
            {failed ? "Unavailable" : scanning ? "Scanning…" : "Download v2"}
          </AppButton>
        }
      />
      {(failed || scanning) && (
        <div className={`callout ${failed ? "danger" : "warning"} wide`}>
          <Icon name={failed ? "x" : "clock"} />
          <span>
            <strong>{tNode(failed ? "Scan failed" : "File is being scanned (simulated)")}</strong>
            {tNode(failed
              ? " The demo scanner could not process this file. Upload a clean replacement as a new version; the prior version will remain in history."
              : " Download stays disabled until the simulated scan finishes. No file has been uploaded to a server.")}
          </span>
        </div>
      )}
      <div className="detail-grid">
        <div className="detail-main">
          <Panel>
            <PanelHeading title={t("Document dates")} meta={t("Dates represent different events")} />
            <div className="date-grid">
              <DateFact
                label={t("Issue date")}
                value={scanning ? "09/11/2026" : "07/11/2026"}
                help={t("Printed on the document")}
              />
              <DateFact
                label={t("Receipt date")}
                value={scanning ? "—" : "08/11/2026"}
                help={t("Received by the company")}
              />
              <DateFact
                label={t("Dispatch date")}
                value={scanning ? "09/11/2026" : "—"}
                help={t("Sent by the company")}
              />
              <DateFact
                label={t("Registered")}
                value="09/11/2026 · 09:12"
                help={t("Entered into this portal")}
              />
            </div>
          </Panel>
          <Panel>
            <PanelHeading title={t("Movement history")} meta={t("Repeated movements are preserved")} />
            <div className="timeline compact">
              <TimelineItem
                date="09 Nov · 09:12"
                title={t("Registered by Office")}
                text={t("Internal registry record created.")}
              />
              <TimelineItem
                date={scanning ? "09 Nov · 08:44" : "08 Nov · 14:30"}
                title={scanning ? "Dispatched to Company A" : "Received from Company A"}
                text={
                  scanning
                    ? "Sent by secure external channel."
                    : "Receipt recorded after the Company A visit."
                }
              />
            </div>
          </Panel>
        </div>
        <aside className="detail-side">
          <Panel>
            <PanelHeading title={t("Registry")} />
            <dl className="detail-list">
              <dt>{t("Internal number")}</dt>
              <dd className="mono">
                {tNode(failed ? "REG-2026-0179" : scanning ? "REG-2026-0185" : "REG-2026-0184")}
              </dd>
              <dt>{t("External number")}</dt>
              <dd>{tNode(scanning ? "RESP-2026-44" : "PROP-A-0711")}</dd>
              <dt>{t("Direction")}</dt>
              <dd>{tNode(scanning ? "Sent" : "Received")}</dd>
              <dt>{t("Owning department")}</dt>
              <dd>{tNode(scanning ? "Office" : "Finance")}</dd>
              <dt>{t("File state")}</dt>
              <dd>
                <Status>{failed ? "Scan failed" : scanning ? "Scanning" : "Available"}</Status>
              </dd>
            </dl>
          </Panel>
          <Panel>
            <PanelHeading title={t("File versions")} meta={t("Never overwritten")} />
            <div className="version">
              <span>
                <strong>{t("Version 2")}</strong>
                <small>{t("Uploaded 09/11/2026 · 09:24")}</small>
              </span>
              <Status>{failed ? "Scan failed" : scanning ? "Scanning" : "Available"}</Status>
            </div>
            {!scanning && !failed && (
              <div className="version">
                <span>
                  <strong>{t("Version 1")}</strong>
                  <small>{t("Uploaded 09/11/2026 · 09:15")}</small>
                </span>
                <Status tone="neutral">{t("Superseded")}</Status>
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}

function DateFact({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="date-fact">
      <span>{tNode(label)}</span>
      <strong>{tNode(value)}</strong>
      <small>{tNode(help)}</small>
    </div>
  );
}

function Companies({ go }: { go: (p: string) => void }) {
  const [search, setSearch] = useState("");
  const companies = [
    ["company-a", "Company A", "Maya Chen", "2 open tasks", "Contacted 08/11/2026"],
    ["company-b", "Company B", "Kiet Vong", "1 open task", "Contacted 05/11/2026"],
    [
      "mekong-demo",
      "Mekong Services (demo)",
      "Nila Phommasone",
      "No open tasks",
      "Contacted 29/10/2026",
    ],
  ].filter((c) => c[1].toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <PageHeader
        title={t("Companies")}
        description={t("External organizations and their permitted relationship history.")}
        action={
          <AppButton variant="primary">
            <Icon name="plus" />{t("Add company")}</AppButton>
        }
      />
      <Panel>
        <SearchFilters value={search} setValue={setSearch} />
        <div className="company-list">
          {tNode(companies.map((c) => (
            <button key={c[0]} onClick={() => go(`/companies/${c[0]}`)}>
              <span className="company-logo">
                {tNode(c[1]
                  .split(" ")
                  .slice(0, 2)
                  .map((v) => v[0])
                  .join(""))}
              </span>
              <span>
                <strong>{tNode(c[1])}</strong>
                <small>{t("Synthetic company · Owner:")}{tNode(c[2])}</small>
              </span>
              <span>
                <strong>{tNode(c[3])}</strong>
                <small>{tNode(c[4])}</small>
              </span>
              <Icon name="arrow" />
            </button>
          )))}
        </div>
      </Panel>
    </>
  );
}

function CompanyProfile({ go, tasks }: { go: (p: string) => void; tasks: Task[] }) {
  const [tab, setTab] = useState("Timeline");
  return (
    <>
      <button className="back-link" onClick={() => go("/companies")}>{t("← Back to companies")}</button>
      <PageHeader
        eyebrow={t("SYNTHETIC COMPANY")}
        title={t("Company A")}
        description={t("External services partner · Relationship owner: Maya Chen")}
        action={
          <AppButton variant="primary" onClick={() => go("/companies/company-a/interactions/new")}>
            <Icon name="plus" />{t("Log interaction")}</AppButton>
        }
      />
      <div className="tabs" role="tablist">
        {tNode(["Overview", "Timeline", "Tasks", "Documents"].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {tNode(t)}
          </button>
        )))}
      </div>
      {tab === "Timeline" && (
        <div className="company-layout">
          <Panel className="company-timeline">
            <PanelHeading title={t("Company history")} meta={t("Sorted by occurrence date · newest first")} />
            <div className="timeline">
              <TimelineItem
                date="09 NOV 2026"
                time="11:20"
                title={t("Response dispatched")}
                text={t("Response issued and sent to Company A.")}
                tag="Document"
                onClick={() => go("/documents/DOC-2026-185")}
              />
              <TimelineItem
                date="08 NOV 2026"
                title={t("On-site requirements meeting")}
                text={t("Discussed the service proposal and system requirements. Finance reviews commercial details; IT confirms technical requirements.")}
                tag="Interaction"
                extra="Occurred 08/11/2026 · Recorded 09/11/2026 at 08:42"
                onClick={() => go("/tasks/TSK-1048")}
              />
              <TimelineItem
                date="08 NOV 2026"
                time="14:30"
                title={t("Proposal received")}
                text={t("Service proposal issued 07/11, received 08/11, uploaded 09/11.")}
                tag="Document"
                onClick={() => go("/documents/DOC-2026-184")}
              />
              <TimelineItem
                date="28 OCT 2026"
                time="10:15"
                title={t("Introductory call")}
                text={t("Introductions and initial service scope. Next step: arrange requirements meeting.")}
                tag="Interaction"
              />
            </div>
          </Panel>
          <aside>
            <Panel>
              <PanelHeading title={t("Next steps")} />
              <div className="mini-task">
                <span className="task-check" />
                <span>
                  <strong>{t("Confirm technical requirements")}</strong>
                  <small>{t("Assigned to Nila · due 10 Nov")}</small>
                </span>
              </div>
              <AppButton variant="secondary" onClick={() => go("/tasks/TSK-1048")}>{t("Open follow-up task")}</AppButton>
            </Panel>
            <div className="scope-note panel-note">
              <Icon name="lock" />
              <span>{t("Opening this company does not grant access to every associated document.")}</span>
            </div>
          </aside>
        </div>
      )}
      {tab === "Overview" && (
        <div className="detail-grid">
          <Panel>
            <PanelHeading title={t("Contacts")} />
            <div className="contact">
              <Avatar initials="SK" />
              <span>
                <strong>{t("Somsak K. (demo)")}</strong>
                <small>{t("External · Operations Director")}</small>
              </span>
            </div>
            <div className="contact">
              <Avatar initials="AL" />
              <span>
                <strong>{t("Anya L. (demo)")}</strong>
                <small>{t("External · Technical Lead")}</small>
              </span>
            </div>
          </Panel>
          <Panel>
            <PanelHeading title={t("Relationship")} />
            <dl className="detail-list">
              <dt>{t("Owner")}</dt>
              <dd>{t("Maya Chen · Finance")}</dd>
              <dt>{t("Last contact")}</dt>
              <dd>08/11/2026</dd>
              <dt>{t("Access")}</dt>
              <dd>{t("Record-specific")}</dd>
            </dl>
          </Panel>
        </div>
      )}
      {tab === "Tasks" && (
        <Panel>
          <PanelHeading title={t("Related tasks")} />
          {tasks
            .filter((t) => t.company === "Company A")
            .map((t) => (
              <Record
                key={t.id}
                icon="check"
                title={t.title}
                meta={`${t.id} · ${t.assignee} · ${formatDue(t.due)}`}
                badge={t.state}
                onClick={() => go(`/tasks/${t.id}`)}
              />
            ))}
        </Panel>
      )}
      {tab === "Documents" && (
        <Panel>
          <PanelHeading title={t("Permitted documents")} />
          <Record
            icon="file"
            title={t("Service proposal — Company A")}
            meta={t("REG-2026-0184 · v2")}
            badge="Available"
            onClick={() => go("/documents/DOC-2026-184")}
          />
          <Record
            icon="file"
            title={t("Response to proposal")}
            meta={t("REG-2026-0185 · v1")}
            badge="Scanning"
            onClick={() => go("/documents/DOC-2026-185")}
          />
        </Panel>
      )}
    </>
  );
}

function TimelineItem({
  date,
  time,
  title,
  text,
  tag,
  extra,
  onClick,
}: {
  date: string;
  time?: string;
  title: string;
  text: string;
  tag?: string;
  extra?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="timeline-date">
        <strong>{tNode(date)}</strong>
        {tNode(time && <span>{tNode(time)}</span>)}
      </div>
      <div className="timeline-dot" />
      <div className="timeline-content">
        <div>
          {tNode(tag && <Status tone="neutral">{tag}</Status>)}
          <h3>{tNode(title)}</h3>
        </div>
        <p>{tNode(text)}</p>
        {tNode(extra && <small>{tNode(extra)}</small>)}
      </div>
    </>
  );
  return onClick ? (
    <button className="timeline-item" onClick={onClick}>
      {tNode(content)}
    </button>
  ) : (
    <div className="timeline-item">{tNode(content)}</div>
  );
}

function InteractionEditor({ go }: { go: (p: string) => void }) {
  const [saved, setSaved] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(true);
  };
  if (saved)
    return (
      <Panel className="success-state">
        <span className="success-icon">✓</span>
        <h1>{t("Interaction recorded locally")}</h1>
        <p>{t("This demo change was not sent to a server. The occurrence date controls its position in the timeline.")}</p>
        <AppButton variant="primary" onClick={() => go("/companies/company-a")}>{t("Return to Company A")}</AppButton>
      </Panel>
    );
  return (
    <>
      <button className="back-link" onClick={() => go("/companies/company-a")}>{t("← Cancel and return")}</button>
      <PageHeader
        title={t("Log interaction")}
        description={t("Record what occurred. Entry time is added separately as system metadata.")}
      />
      <form className="form-layout" onSubmit={submit}>
        <Panel>
          <div className="field-grid">
            <Field label={t("Company")}>
              <select defaultValue="Company A">
                <option value="Company A">{t("Company A")}</option>
              </select>
            </Field>
            <Field label={t("Interaction type")}>
              <select>
                <option value="On-site visit">{t("On-site visit")}</option>
                <option value="Call">{t("Call")}</option>
                <option value="Email">{t("Email")}</option>
              </select>
            </Field>
            <Field label={t("Occurrence date")}>
              <input required type="date" defaultValue="2026-11-08" />
            </Field>
            <Field label={t("Time (optional)")}>
              <input type="time" />
              <small>{t("Leave blank if only the date is known.")}</small>
            </Field>
          </div>
          <Field label={t("Participants")}>
            <input defaultValue={t("Maya Chen (internal), Nila Phommasone (internal), Somsak K. (external, demo)")} />
          </Field>
          <Field label={t("Discussion")}>
            <textarea rows={4} defaultValue={t("Service proposal and system requirements.")} />
          </Field>
          <Field label={t("Decisions")}>
            <textarea
              rows={3}
              defaultValue={t("Finance reviews commercial details; IT confirms technical requirements.")}
            />
          </Field>
          <Field label={t("Next steps")}>
            <textarea
              rows={3}
              defaultValue={t("Create an assigned follow-up task for technical confirmation.")}
            />
          </Field>
          <div className="form-actions">
            <AppButton variant="ghost" onClick={() => go("/companies/company-a")}>{t("Cancel")}</AppButton>
            <AppButton variant="primary" type="submit">{t("Save demo interaction")}</AppButton>
          </div>
        </Panel>
        <aside>
          <Panel>
            <PanelHeading title={t("Linked records")} />
            <Field label={t("Documents")}>
              <select>
                <option value="Service proposal — REG-2026-0184">{t("Service proposal — REG-2026-0184")}</option>
              </select>
            </Field>
            <Field label={t("Follow-up task")}>
              <select>
                <option value="Create new assigned task">{t("Create new assigned task")}</option>
                <option value="TSK-1048">{t("TSK-1048")}</option>
              </select>
            </Field>
          </Panel>
          <div className="scope-note panel-note">
            <Icon name="clock" />
            <span>{t("Entry timestamp will be recorded automatically. It does not replace the occurrence date.")}</span>
          </div>
        </aside>
      </form>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{tNode(label)}</span>
      {tNode(children)}
    </label>
  );
}

function WorkFeed({ go }: { go: (p: string) => void }) {
  const [posted, setPosted] = useState(false);
  return (
    <>
      <PageHeader
        title={t("Work feed")}
        description={t("Updates and task-linked discussions visible within your scope.")}
      />
      <div className="feed-layout">
        <main className="feed-column">
          <Panel className="composer">
            <div className="composer-top">
              <Avatar />
              <textarea
                aria-label={t("Post an update")}
                placeholder={t("Share an update with your team…")}
                rows={2}
              />
            </div>
            <div className="composer-actions">
              <select aria-label={t("Post type")}>
                <option value="General update">{t("General update")}</option>
                <option value="Link to task…">{t("Link to task…")}</option>
              </select>
              <AppButton variant="primary" onClick={() => setPosted(true)}>{t("Post locally")}</AppButton>
            </div>
            {posted && (
              <div className="inline-success">{t("Update added to this local demo session.")}</div>
            )}
          </Panel>
          <Post
            initials="MC"
            name="Maya Chen"
            dept="Finance"
            visibility="Finance + IT"
            time="Today, 10:42"
            text={t("Commercial review is underway. I’ve added the open pricing questions to the task.")}
            mention="@IT"
            task="Review commercial details"
            onTask={() => go("/tasks/TSK-1043")}
          />
          <Post
            initials="NP"
            name="Nila Phommasone"
            dept="IT"
            visibility="Task participants"
            time="Today, 09:18"
            text={t("The technical requirements from yesterday’s visit are documented. @Maya, please review the data retention note.")}
            mention="@Maya"
            task="Confirm technical requirements"
            onTask={() => go("/tasks/TSK-1048")}
          />
        </main>
        <aside className="feed-aside">
          <Panel>
            <PanelHeading title={t("What actions mean")} />
            <ul className="meaning-list">
              <li>
                <strong>{t("Assignee")}</strong>
                <span>{t("Responsible for task completion")}</span>
              </li>
              <li>
                <strong>{t("Mention")}</strong>
                <span>{t("Awareness and notification only")}</span>
              </li>
              <li>
                <strong>{t("Sharing")}</strong>
                <span>{t("Permission to view a record")}</span>
              </li>
              <li>
                <strong>{t("Approval")}</strong>
                <span>{t("Separate workflow, not enabled")}</span>
              </li>
            </ul>
          </Panel>
        </aside>
      </div>
    </>
  );
}

function Post({
  initials,
  name,
  dept,
  visibility,
  time,
  text,
  mention,
  task,
  onTask,
}: {
  initials: string;
  name: string;
  dept: string;
  visibility: string;
  time: string;
  text: string;
  mention: string;
  task: string;
  onTask: () => void;
}) {
  return (
    <Panel className="post">
      <div className="post-head">
        <Avatar initials={initials} />
        <div>
          <strong>{tNode(name)}</strong>
          <span>
            {tNode(dept)} · {tNode(time)}
          </span>
        </div>
        <Status tone="neutral">
          <Icon name="lock" size={12} /> {visibility}
        </Status>
        <button aria-label={t("More")}>
          <Icon name="more" />
        </button>
      </div>
      <p>
        {tNode(text.split(mention)[0])}
        <mark>{tNode(mention)}</mark>
        {tNode(text.split(mention)[1])}
      </p>
      <button className="linked-task" onClick={onTask}>
        <Icon name="check" />
        <span>
          <small>{t("LINKED TASK")}</small>
          <strong>{tNode(task)}</strong>
        </span>
        <Status>{t("In progress")}</Status>
        <Icon name="arrow" />
      </button>
      <div className="post-footer">
        <button>{t("Comment · 2")}</button>
        <button>
          <Icon name="link" size={15} />{t("Document · 1")}</button>
      </div>
    </Panel>
  );
}

function Notifications({ go }: { go: (p: string) => void }) {
  const [read, setRead] = useState<string[]>([]);
  const notifications = [
    [
      "n1",
      "mention",
      "Maya mentioned you",
      "Review the retention note in the technical requirements task.",
      "/tasks/TSK-1048",
      "8 min",
    ],
    [
      "n2",
      "check",
      "Task assigned to you",
      "Register response document · due today.",
      "/tasks/TSK-1039",
      "1 hr",
    ],
    [
      "n3",
      "feed",
      "New comment",
      "Nila commented on Confirm technical requirements.",
      "/tasks/TSK-1048",
      "2 hr",
    ],
    [
      "n4",
      "clock",
      "Deadline approaching",
      "Audit Q4 access sample is due in 3 days.",
      "/tasks/TSK-1034",
      "Yesterday",
    ],
  ];
  return (
    <>
      <PageHeader
        title={t("Notifications")}
        description={t("Mentions, assignments, comments, and deadlines.")}
        action={
          <AppButton onClick={() => setRead(notifications.map((n) => n[0]))}>{t("Mark all read")}</AppButton>
        }
      />
      <Panel className="notification-list">
        {notifications.map((n) => (
          <button
            className={read.includes(n[0]) ? "read" : ""}
            key={n[0]}
            onClick={() => {
              setRead([...read, n[0]]);
              go(n[4]);
            }}
          >
            <span className="notification-icon">
              <Icon name={n[1]} />
            </span>
            <span>
              <strong>{tNode(n[2])}</strong>
              <small>{tNode(n[3])}</small>
            </span>
            <time>{tNode(n[5])}</time>
            {tNode(!read.includes(n[0]) && <i />)}
          </button>
        ))}
        <button onClick={() => go("/unavailable")}>
          <span className="notification-icon">
            <Icon name="lock" />
          </span>
          <span>
            <strong>{t("Record no longer available")}</strong>
            <small>{t("Your access was revoked. Confidential metadata is hidden.")}</small>
          </span>
          <time>{t("2 days")}</time>
        </button>
      </Panel>
    </>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <Icon name="search" size={24} />
      <strong>{tNode(title)}</strong>
      <span>{tNode(text)}</span>
    </div>
  );
}
function Unavailable({ go }: { go: (p: string) => void }) {
  return (
    <Panel className="unavailable">
      <span className="auth-icon">
        <Icon name="lock" />
      </span>
      <h1>{t("Record unavailable")}</h1>
      <p>{t("This record does not exist, or your access was restricted or revoked. Confidential metadata is not shown.")}</p>
      <AppButton variant="primary" onClick={() => go("/dashboard")}>{t("Return to dashboard")}</AppButton>
    </Panel>
  );
}

function Modal({ close, children }: { close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        ref={ref}
      >
        <button className="modal-close" onClick={close} aria-label={t("Close")}>
          <Icon name="x" />
        </button>
        {tNode(children)}
      </div>
    </div>
  );
}

function NewTaskModal({ close, add }: { close: () => void; add: (task: Task) => void }) {
  const [title, setTitle] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const form = new FormData(e.currentTarget as HTMLFormElement);
    add({
      id: `TSK-${crypto.randomUUID()}`,
      title: title.trim(),
      state: String(form.get("state")) as TaskState,
      due: String(form.get("due")),
      assignee: String(form.get("assignee")),
      department: String(form.get("department")),
      company: String(form.get("company") || "") || undefined,
      collaborators: [],
    });
    close();
  };
  return (
    <Modal close={close}>
      <h2 id="modal-title">{t("Create demo task")}</h2>
      <p>{t("Creates a local task for this session only.")}</p>
      <form onSubmit={submit}>
        <Field label={t("Task title")}>
          <input
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("What needs to be done?")}
          />
        </Field>
        <div className="field-grid">
          <Field label={t("Primary assignee")}>
            <select name="assignee">
              <option value="You">{t("You (demo)")}</option>
              <option value="Nila Phommasone">{t("Nila Phommasone")}</option>
            </select>
          </Field>
          <Field label={t("State")}>
            <select name="state">
              <option value="To do">{t("To do")}</option>
              <option value="In progress">{t("In progress")}</option>
              <option value="Blocked">{t("Blocked")}</option>
              <option value="Done">{t("Done")}</option>
              <option value="Cancelled">{t("Cancelled")}</option>
            </select>
          </Field>
          <Field label={t("Department")}>
            <select name="department">
              <option value="Office">{t("Office")}</option>
              <option value="IT">{t("IT")}</option>
              <option value="Finance">{t("Finance")}</option>
              <option value="Operation">{t("Operation")}</option>
              <option value="Audit">{t("Audit")}</option>
            </select>
          </Field>
          <Field label={t("Due date")}>
            <input name="due" required type="date" defaultValue={todayDate()} />
          </Field>
          <Field label={t("Related company")}>
            <select name="company">
              <option value="">{t("Internal work")}</option>
              <option value="Company A">{t("Company A")}</option>
            </select>
          </Field>
        </div>
        <div className="form-actions">
          <AppButton variant="ghost" onClick={close}>{t("Cancel")}</AppButton>
          <AppButton variant="primary" type="submit">{t("Create local task")}</AppButton>
        </div>
      </form>
    </Modal>
  );
}

function Portal() {
  const { path: location, go: navigate } = usePath();
  const [workspacePath, query = ""] = location.split("?");
  usePageAudit(workspacePath);
  const documentMode = isDocumentWorkspace(workspacePath);
  const sharedPage = workspacePath.startsWith('/document-workspace/portal/');
  const path = sharedPage ? workspacePath.slice('/document-workspace/portal'.length) : workspacePath;
  const go = (next: string) => navigate(documentMode && !isDocumentWorkspace(next) ? '/document-workspace/portal' + next : next);
  const [drawer, setDrawer] = useState(false);
  const notifications=useTaskData('/api/v1/notifications?limit=1',notificationsSchema);
  useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)notifications.reload();},30000);window.addEventListener(NOTIFICATIONS_CHANGED,notifications.reload);return()=>{clearInterval(timer);window.removeEventListener(NOTIFICATIONS_CHANGED,notifications.reload);};},[notifications.reload]);
  const title = path==='/admin/audit'?'ປະຫວັດການໃຊ້ງານ':path==='/settings'?'ຕັ້ງຄ່າ':path==='/search'?'Search':path==='/account'?'ບັນຊີຂອງຂ້ອຍ':path.startsWith('/tasks')?'Tasks':path.startsWith('/documents')?'Documents':path.startsWith('/companies')?'Companies':path.startsWith('/feed')?'Work Feed':path.startsWith('/notifications')?'Notifications':path.startsWith('/admin')?'Administration':'Dashboard';
  const taskId=path.match(/^\/tasks\/([^/]+)/)?.[1];
  const content=useMemo(()=>{
    const profile=path.match(/^\/tasks\/([0-9a-f-]+)\/comments\/([0-9a-f-]+)\/profile$/i);
    if(profile)return <TaskMemberProfile taskId={profile[1]} commentId={profile[2]} go={go}/>;
    if(path.startsWith('/tasks'))return <ConnectedTasks key={path+'?'+query} id={taskId} query={query} go={go}/>;
    if(path==='/dashboard'||path==='/sign-in'||path==='/')return <TaskDashboard go={go}/>;
    if(path==='/account')return <PasswordChange/>;
    if(path==='/settings')return <SettingsPage/>;
    if(path==='/admin/audit')return <AuditLogs/>;
    if(path==='/search')return <PortalSearch query={query} go={go}/>;
    if(path==='/notifications')return <PortalNotifications go={go}/>;
    const kinds=[['feed','post'],['companies','company'],['documents','document'],['interactions','interaction']] as const;
    for(const [segment,kind]of kinds){const match=path.match(new RegExp('^/'+segment+'(?:/([^/]+))?$'));if(match)return <PortalRecords key={path} kind={kind} id={match[1]} query={query} go={go}/>;}
    const companyInteraction=path.match(/^\/companies\/([^/]+)\/interactions\/new$/);if(companyInteraction)return <PortalRecords kind="interaction" id="new" query={'companyId='+companyInteraction[1]} go={go}/>;
    if(path==='/admin/people')return <IdentityAdmin type="people"/>;
    if(path==='/admin/departments')return <IdentityAdmin type="departments"/>;
    if(path==='/admin/access')return <IdentityAdmin type="access"/>;
    return <Unavailable go={go}/>;
  },[path,query,taskId,documentMode]);
  if (documentMode) return <Suspense fallback={<Skeleton variant="page" />}><DocumentWorkspace switcher={<PlatformSwitcher />} actions={<PortalHeaderActions go={go} unread={notifications.data?.unread} />} sharedContent={sharedPage ? content : undefined} sharedTitle={t(title)} /></Suspense>;
  return <div className="app-shell"><Sidebar path={path} go={go} open={drawer} close={()=>setDrawer(false)} unread={notifications.data?.unread}/><div className="app-main"><Topbar title={title} openMenu={()=>setDrawer(true)} go={go} unread={notifications.data?.unread}/><main className="page"><Suspense key={path} fallback={<Skeleton variant={path==='/dashboard'?'dashboard':path.endsWith('/new')?'form':'page'}/>}>{content}</Suspense></main></div></div>;
}

export default function App(){return <Authentication><GlimmAutopilot><Portal/></GlimmAutopilot></Authentication>;}
