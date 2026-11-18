/* Hallmark · component: notification center · genre: modern-minimal · theme: Portal
 * pre-emit critique: P5 H5 E4 S5 R5 V4 */
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useLocation } from "react-router-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  ArrowRight,
  ArrowUpRight,
  AtSign,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  ListChecks,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
  X,
  type LucideIcon,
} from "lucide-react";
import { notificationsSchema, type NotificationItem } from "@lapnet/contracts";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api";
import { useTaskData, timeLabel } from "@/features/tasks/api";
import { errorText } from "@/features/identity/Auth";
import { t } from "@/i18n/lo";
import "./notifications.css";

gsap.registerPlugin(useGSAP);
export const NOTIFICATIONS_CHANGED = "lapnet:notifications-changed";
function motionValue(element: Element, name: string) {
  return parseFloat(getComputedStyle(element).getPropertyValue(name)) || 0;
}
type View = "all" | "unread" | "mentions" | "tasks" | "comments";
type Go = (path: string) => void;
const tabs: { id: View; label: string }[] = [
  { id: "all", label: "ທັງໝົດ" },
  { id: "unread", label: "ຍັງບໍ່ອ່ານ" },
  { id: "mentions", label: "@ ກ່າວເຖິງ" },
  { id: "tasks", label: "ວຽກ" },
];
const kinds: Record<string, { label: string; verb: string; icon: LucideIcon; tone: string }> = {
  mention: { label: "ກ່າວເຖິງ", verb: "ກ່າວເຖິງທ່ານໃນ", icon: AtSign, tone: "mention" },
  comment: { label: "ຄວາມຄິດເຫັນ", verb: "ຂຽນຄວາມຄິດເຫັນໃນ", icon: MessageCircle, tone: "comment" },
  assignment: { label: "ມອບໝາຍວຽກ", verb: "ມອບໝາຍ / ອັບເດດວຽກ", icon: ListChecks, tone: "task" },
  status: { label: "ສະຖານະວຽກ", verb: "ປ່ຽນສະຖານະວຽກ", icon: CheckCheck, tone: "task" },
  due_today: { label: "ຄົບກຳນົດມື້ນີ້", verb: "ວຽກຄົບກຳນົດມື້ນີ້", icon: Clock3, tone: "due" },
  overdue: { label: "ເກີນກຳນົດ", verb: "ວຽກເກີນກຳນົດ", icon: Clock3, tone: "due" },
};
function changed() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}
function useNotifications(view: View, limit: number, cursor?: string) {
  const result = useTaskData(
    `/api/v1/notifications?limit=${limit}&view=${view}${cursor ? "&cursor=" + cursor : ""}`,
    notificationsSchema,
  );
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) result.reload();
    };
    window.addEventListener(NOTIFICATIONS_CHANGED, result.reload);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(NOTIFICATIONS_CHANGED, result.reload);
    };
  }, [result.reload]);
  return result;
}
function useNotificationAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  async function run(path: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await apiRequest(path, "POST");
      changed();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
function useWorkspaceHref() {
  const location = useLocation();
  return (href: string) =>
    location.pathname.startsWith("/document-workspace") && !href.startsWith("/document-workspace")
      ? "/document-workspace/portal" + href
      : href;
}
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 1) return "ເມື່ອກີ້";
  if (minutes < 60) return `${minutes} ນາທີກ່ອນ`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} ຊົ່ວໂມງກ່ອນ`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)} ມື້ກ່ອນ`;
  return timeLabel(value);
}
function plainClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}
function NotificationRow({ item, go }: { item: NotificationItem; go: Go }) {
  const action = useNotificationAction();
  const href = useWorkspaceHref();
  const kind = kinds[item.kind] ?? {
    label: "ແຈ້ງເຕືອນ",
    verb: "ອັບເດດໃໝ່ໃນ",
    icon: Bell,
    tone: "task",
  };
  const KindIcon = kind.icon;
  const read = () => action.run(`/api/v1/notifications/${item.id}/read`);
  return (
    <li
      className="notify-row"
      data-unread={!item.readAt || undefined}
      data-tone={kind.tone}
      aria-busy={action.busy}
    >
      <a
        className="notify-row-link"
        href={href(item.href)}
        onClick={(event) => {
          if (!plainClick(event)) return;
          event.preventDefault();
          if (!item.readAt) void read();
          go(item.href);
        }}
      >
        <span className="notify-avatar" aria-hidden="true">
          {item.actor ? (
            item.actor.displayName
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((name) => Array.from(name)[0])
              .join("")
              .toUpperCase()
          ) : (
            <KindIcon size={20} />
          )}
          {!item.readAt && <i className="notify-unread-dot" />}
        </span>
        <span className="notify-row-copy">
          <span className="notify-summary">
            {item.actor && <strong>{item.actor.displayName} </strong>}
            <span>{kind.verb} </span>
            <strong className="notify-resource">{item.title}</strong>
          </span>
          <span className="notify-meta">
            <time dateTime={item.createdAt} title={timeLabel(item.createdAt)}>
              {relativeTime(item.createdAt)}
            </time>
            {item.actor?.department && <span>· {t(item.actor.department)}</span>}
            {item.code && <span>· {item.code}</span>}
          </span>
          {!item.readAt && <span className="sr-only">ຍັງບໍ່ອ່ານ</span>}
          {item.excerpt && <span className="notify-excerpt">{item.excerpt}</span>}
        </span>
      </a>
      <div className="notify-row-actions">
        <span className="notify-kind" title={kind.label}>
          <KindIcon size={18} aria-hidden="true" />
          <span className="sr-only">{kind.label}</span>
        </span>
        <Dropdown.Root modal={false}>
          <Dropdown.Trigger asChild>
            <button
              type="button"
              className="notify-icon-button"
              disabled={action.busy}
              aria-label={`ຕົວເລືອກ: ${item.title}`}
            >
              {action.busy ? (
                <Skeleton variant="inline" />
              ) : (
                <MoreHorizontal size={18} aria-hidden="true" />
              )}
            </button>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content
              className="notify-action-menu"
              align="end"
              sideOffset={4}
              collisionPadding={12}
            >
              <Dropdown.Item
                onSelect={() => {
                  if (!item.readAt) void read();
                  go(item.href);
                }}
              >
                <ArrowUpRight size={16} aria-hidden="true" />
                ເປີດລາຍການ
              </Dropdown.Item>
              <Dropdown.Item disabled={!!item.readAt} onSelect={() => void read()}>
                <Check size={16} aria-hidden="true" />
                {item.readAt ? "ອ່ານແລ້ວ" : "ໝາຍວ່າອ່ານແລ້ວ"}
              </Dropdown.Item>
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </div>
      {action.error && (
        <div className="notify-action-error" role="alert">
          {action.error}
          <button type="button" onClick={() => void read()}>
            ລອງໃໝ່
          </button>
        </div>
      )}
    </li>
  );
}
function Filters({ value, set }: { value: View; set: (view: View) => void }) {
  return (
    <div className="notify-tabs" role="group" aria-label="ກັ່ນຕອງແຈ້ງເຕືອນ">
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab.id}
          aria-pressed={value === tab.id}
          onClick={() => set(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
function Feedback({
  loading,
  error,
  reload,
}: {
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  return loading ? (
    <div className="notify-loading">
      <Skeleton variant="rows" rows={3} />
    </div>
  ) : error ? (
    <div className="notify-error" role="alert">
      <p>{error}</p>
      <button type="button" className="button secondary" onClick={reload}>
        ລອງໃໝ່
      </button>
    </div>
  ) : null;
}
function Empty({ view }: { view: View }) {
  return (
    <div className="notify-empty">
      <span>
        <CheckCheck size={24} aria-hidden="true" />
      </span>
      <h3>{view === "unread" ? "ອ່ານຄົບແລ້ວ" : "ຍັງບໍ່ມີແຈ້ງເຕືອນ"}</h3>
      <p>
        {view === "unread" ? "ແຈ້ງເຕືອນໃໝ່ຈະປາກົດຢູ່ບ່ອນນີ້." : "ການກ່າວເຖິງ ແລະ ອັບເດດວຽກທີ່ທ່ານມີສິດເບິ່ງຈະຢູ່ບ່ອນນີ້."}
      </p>
    </div>
  );
}
function ReadAll({
  unread,
  disabled,
  action,
}: {
  unread: number;
  disabled?: boolean;
  action: ReturnType<typeof useNotificationAction>;
}) {
  return (
    <button
      type="button"
      className="notify-read-all"
      disabled={!unread || action.busy || disabled}
      onClick={() => void action.run("/api/v1/notifications/read-all")}
    >
      {action.busy ? <Skeleton variant="inline" /> : <CheckCheck size={16} aria-hidden="true" />}
      <span>ອ່ານທັງໝົດ</span>
    </button>
  );
}
function NotificationPreview({ go }: { go: Go }) {
  const [view, setView] = useState<View>("all");
  const { data, loading, error, reload } = useNotifications(view, 6);
  return (
    <>
      <div className="notify-preview-tools">
        <Filters value={view} set={setView} />
      </div>
      <div className="notify-preview-scroll">
        <Feedback loading={loading} error={error} reload={reload} />
        {data && (
          <>
            {data.items.length ? (
              <ol className="notify-list">
                {data.items.map((item) => (
                  <NotificationRow key={item.id} item={item} go={go} />
                ))}
              </ol>
            ) : (
              !loading && !error && <Empty view={view} />
            )}
          </>
        )}
      </div>
    </>
  );
}
export function NotificationBell({ go, unread }: { go: Go; unread?: number }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null),
    closing = useRef(false);
  const location = useLocation(),
    href = useWorkspaceHref();
  useEffect(() => {
    setOpen(false);
    closing.current = false;
  }, [location.pathname, location.search]);
  const { contextSafe } = useGSAP(
    () => {
      if (!open || !panel.current) return;
      const media = gsap.matchMedia();
      media.add(
        {
          normal: "(prefers-reduced-motion: no-preference)",
          reduced: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const reduced = context.conditions?.reduced;
          gsap.fromTo(
            panel.current,
            {
              autoAlpha: 0,
              y: reduced ? 0 : -motionValue(panel.current!, "--distance-notification-enter"),
              scale: reduced ? 1 : 0.985,
            },
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: reduced
                ? 0
                : motionValue(panel.current!, "--duration-notification-enter") / 1000,
              ease: "power2.out",
              overwrite: "auto",
            },
          );
        },
        panel,
      );
      return () => media.revert();
    },
    { scope: panel, dependencies: [open], revertOnUpdate: true },
  );
  const close = contextSafe((after?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    const finish = () => {
      closing.current = false;
      setOpen(false);
      after?.();
    };
    if (!panel.current) {
      finish();
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.to(panel.current, {
      autoAlpha: 0,
      y: reduced ? 0 : -4,
      scale: reduced ? 1 : 0.99,
      duration: reduced ? 0 : motionValue(panel.current!, "--duration-notification-exit") / 1000,
      ease: "power1.in",
      overwrite: "auto",
      onComplete: finish,
    });
  });
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          closing.current = false;
          setOpen(true);
        } else close();
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          className="notification-button notify-bell"
          aria-label={`${t("Notifications")}${unread === undefined ? "" : `, ${unread} ຍັງບໍ່ອ່ານ`}`}
          title={t("Notifications")}
        >
          <Bell size={18} aria-hidden="true" />
          {!!unread && <span className="notify-bell-dot" />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={panel}
          className="notify-popover"
          align="end"
          sideOffset={12}
          collisionPadding={12}
          aria-label="ການແຈ້ງເຕືອນ"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            panel.current
              ?.querySelector<HTMLButtonElement>(".notify-close")
              ?.focus({ preventScroll: true });
          }}
        >
          <header className="notify-popover-heading">
            <div>
              <h2>ການແຈ້ງເຕືອນ</h2>
              {unread !== undefined && <span className="notify-count">{unread} ຍັງບໍ່ອ່ານ</span>}
            </div>
            <button
              type="button"
              className="notify-icon-button notify-close"
              aria-label="ປິດແຈ້ງເຕືອນ"
              onClick={() => close()}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <NotificationPreview go={(path) => close(() => go(path))} />
          <footer className="notify-popover-footer">
            <a
              href={href("/notifications")}
              onClick={(event) => {
                if (!plainClick(event)) return;
                event.preventDefault();
                close(() => go("/notifications"));
              }}
            >
              View all <ArrowRight size={16} aria-hidden="true" />
            </a>
          </footer>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function NotificationInbox({ go, children }: { go: Go; children?: ReactNode }) {
  const [view, setView] = useState<View>("all"),
    [cursors, setCursors] = useState<string[]>([]);
  const { data, loading, refreshing, error, reload } = useNotifications(view, 20, cursors.at(-1));
  const action = useNotificationAction(),
    root = useRef<HTMLDivElement>(null);
  const selectView = (next: View) => {
    setView(next);
    setCursors([]);
  };
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        "(prefers-reduced-motion: no-preference)",
        () => {
          gsap.fromTo(
            root.current,
            { autoAlpha: 0, y: 6 },
            {
              autoAlpha: 1,
              y: 0,
              duration: motionValue(root.current!, "--duration-notification-page") / 1000,
              ease: "power2.out",
              clearProps: "transform,opacity,visibility",
            },
          );
        },
        root,
      );
      return () => media.revert();
    },
    { scope: root },
  );
  const label = view === "comments" ? "ຄວາມຄິດເຫັນ" : tabs.find((tab) => tab.id === view)?.label;
  return (
    <div className="notify-page" ref={root}>
      <header className="notify-page-heading">
        <div>
          <span className="notify-page-symbol">
            <BellRing size={22} aria-hidden="true" />
          </span>
          <h1>ການແຈ້ງເຕືອນ</h1>
          <p>ທຸກການອັບເດດຂອງທ່ານ ຢູ່ໃນບ່ອນດຽວ.</p>
        </div>
        <ReadAll unread={data?.unread ?? 0} disabled={loading || refreshing} action={action} />
      </header>
      {action.error && (
        <div role="alert" className="notify-error">
          {action.error}
          <button
            className="text-button"
            onClick={() => void action.run("/api/v1/notifications/read-all")}
          >
            ລອງໃໝ່
          </button>
        </div>
      )}
      <div className="notify-layout">
        <section className="notify-feed" aria-label="ລາຍການແຈ້ງເຕືອນ">
          <div className="notify-feed-toolbar">
            <Filters value={view} set={selectView} />
            <button
              type="button"
              className="notify-icon-button"
              aria-label="ໂຫຼດແຈ້ງເຕືອນໃໝ່"
              disabled={loading || refreshing}
              onClick={reload}
            >
              {refreshing ? (
                <Skeleton variant="inline" />
              ) : (
                <RefreshCw size={17} aria-hidden="true" />
              )}
            </button>
          </div>
          <div className="notify-feed-label">
            <h2>{label}</h2>
            <span>{data ? `${data.total} ແຈ້ງເຕືອນທັງໝົດ` : ""}</span>
          </div>
          <Feedback loading={loading} error={error} reload={reload} />
          {data && (
            <>
              {data.items.length ? (
                <ol className="notify-list">
                  {data.items.map((item) => (
                    <NotificationRow key={item.id} item={item} go={go} />
                  ))}
                </ol>
              ) : (
                !error && <Empty view={view} />
              )}
              {(cursors.length > 0 || data.nextCursor) && (
                <nav className="notify-pagination" aria-label="ໜ້າແຈ້ງເຕືອນ">
                  <button
                    className="button secondary"
                    disabled={!cursors.length || loading || refreshing}
                    onClick={() => setCursors(cursors.slice(0, -1))}
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                    ກ່ອນໜ້າ
                  </button>
                  <span>{cursors.length + 1}</span>
                  <button
                    className="button secondary"
                    disabled={!data.nextCursor || loading || refreshing}
                    onClick={() => data.nextCursor && setCursors([...cursors, data.nextCursor])}
                  >
                    ຖັດໄປ
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
        <aside className="notify-sidebar">
          <section className="notify-overview">
            <div className="notify-sidebar-heading">
              <h2>Inbox ຂອງທ່ານ</h2>
              <Bell size={18} aria-hidden="true" />
            </div>
            {loading && !data ? (
              <Skeleton variant="card" rows={1} />
            ) : data ? (
              <>
                <strong className="notify-unread-total">{data.unread}</strong>
                <p>ແຈ້ງເຕືອນທີ່ຍັງບໍ່ອ່ານ</p>
                <span className="notify-total-line">{data.total} ລາຍການທັງໝົດ</span>
              </>
            ) : (
              <p>—</p>
            )}
          </section>
          <section className="notify-categories">
            <h2>ປະເພດການອັບເດດ</h2>
            {data?.counts.map((count) => {
              const kind = kinds[count.kind];
              const KindIcon = kind?.icon ?? Bell;
              const category: View =
                count.kind === "mention"
                  ? "mentions"
                  : count.kind === "comment"
                    ? "comments"
                    : "tasks";
              return (
                <button
                  type="button"
                  key={count.kind}
                  data-tone={kind?.tone}
                  onClick={() => selectView(category)}
                >
                  <KindIcon size={16} aria-hidden="true" />
                  <span>{kind?.label ?? "ແຈ້ງເຕືອນ"}</span>
                  <b>{count.count}</b>
                </button>
              );
            })}
            {data && !data.counts.length && <p>ຈະປາກົດເມື່ອມີອັບເດດໃໝ່.</p>}
          </section>
          <p className="notify-privacy">
            <FileText size={15} aria-hidden="true" />
            ສະແດງສະເພາະວຽກ ແລະ ລາຍການທີ່ທ່ານມີສິດເບິ່ງ.
          </p>
        </aside>
      </div>
      {children}
    </div>
  );
}
