import { useId, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { AtSign, MessageCircle, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { Badge } from "./badge";
import { Marker, MarkerContent } from "./timeline-3-utils/marker";
import "./timeline-3.css";

export type Timeline3Item = {
  id: string;
  actor: string;
  avatar?: string;
  createdAt: string;
  edited?: boolean;
  meta?: ReactNode;
  content: ReactNode;
  profile?: { onView: () => void; onMention?: () => void };
};
const zone = "Asia/Vientiane";
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: zone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const date = new Intl.DateTimeFormat("lo-LA", {
  timeZone: zone,
  calendar: "gregory",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const time = new Intl.DateTimeFormat("lo-LA", {
  timeZone: zone,
  hour: "2-digit",
  minute: "2-digit",
});

function AuthorAvatar({ item }: { item: Timeline3Item }) {
  return (
    <Avatar className="size-9 border border-border">
      <AvatarImage src={item.avatar} alt="" />
      <AvatarFallback>
        {item.actor
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => Array.from(part)[0])
          .join("")
          .toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function TimelineEntry({ item }: { item: Timeline3Item }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const nameTrigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(true);
  const menuId = useId();
  function changeOpen(next: boolean) {
    if (next) restoreFocus.current = true;
    setOpen(next);
  }
  const avatar = (
    <>
      <AuthorAvatar item={item} />
      <span className="timeline-three-icon">
        <MessageCircle size={10} aria-hidden="true" />
      </span>
    </>
  );
  return (
    <li className="timeline-three-item">
      <Popover.Root open={open} onOpenChange={changeOpen}>
        {item.profile ? (
          <Popover.Trigger asChild>
            <button
              type="button"
              className="timeline-three-avatar timeline-author-trigger"
              aria-label={`ເມນູໂປຣໄຟລ໌ ${item.actor}`}
              aria-controls={open ? menuId : undefined}
              onClick={(event) => (trigger.current = event.currentTarget)}
            >
              {avatar}
            </button>
          </Popover.Trigger>
        ) : (
          <span className="timeline-three-avatar">{avatar}</span>
        )}
        <div className="timeline-three-content">
          <div className="timeline-three-byline">
            <div>
              {item.profile ? (
                <button
                  ref={nameTrigger}
                  type="button"
                  className="timeline-author-trigger timeline-author-name"
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  aria-controls={open ? menuId : undefined}
                  onClick={(event) => {
                    trigger.current = event.currentTarget;
                    changeOpen(!open);
                  }}
                >
                  <strong>{item.actor}</strong>
                </button>
              ) : (
                <strong>{item.actor}</strong>
              )}
              {item.meta && <small>{item.meta}</small>}
            </div>
            <time
              dateTime={item.createdAt}
              title={
                date.format(new Date(item.createdAt)) + " " + time.format(new Date(item.createdAt))
              }
            >
              {time.format(new Date(item.createdAt))}
              {item.edited ? " · ແກ້ໄຂແລ້ວ" : ""}
            </time>
          </div>
          <div className="timeline-three-body">{item.content}</div>
        </div>
        {item.profile && (
          <Popover.Portal>
            <Popover.Content
              id={menuId}
              className="timeline-author-menu"
              align="start"
              sideOffset={8}
              collisionPadding={12}
              aria-label={`ໂປຣໄຟລ໌ ${item.actor}`}
              onInteractOutside={(event) => {
                if (nameTrigger.current?.contains(event.target as Node)) event.preventDefault();
                else restoreFocus.current = false;
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (restoreFocus.current) trigger.current?.focus({ preventScroll: true });
              }}
            >
              <div className="timeline-author-summary">
                <AuthorAvatar item={item} />
                <strong>{item.actor}</strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  restoreFocus.current = false;
                  setOpen(false);
                  item.profile?.onView();
                }}
              >
                <UserRound size={16} aria-hidden="true" /> View Profile
              </button>
              {item.profile.onMention && (
                <button
                  type="button"
                  onClick={() => {
                    restoreFocus.current = false;
                    setOpen(false);
                    item.profile?.onMention?.();
                  }}
                >
                  <AtSign size={16} aria-hidden="true" /> ກ່າວເຖິງໃນວຽກນີ້
                </button>
              )}
            </Popover.Content>
          </Popover.Portal>
        )}
      </Popover.Root>
    </li>
  );
}

/** The supplied timeline layout, rendered with real comments instead of demonstration events. */
export default function Timeline3({
  items = [],
  showHeader = true,
}: {
  items?: Timeline3Item[];
  showHeader?: boolean;
}) {
  const today = day.format(new Date()),
    yesterday = day.format(new Date(Date.now() - 86_400_000));
  const groups = new Map<string, { label: string; items: Timeline3Item[] }>();
  for (const item of items) {
    const key = day.format(new Date(item.createdAt));
    if (!groups.has(key))
      groups.set(key, {
        label:
          key === today ? "ມື້ນີ້" : key === yesterday ? "ມື້ວານ" : date.format(new Date(item.createdAt)),
        items: [],
      });
    groups.get(key)!.items.push(item);
  }
  return (
    <div className="timeline-three">
      {showHeader && (
        <div className="timeline-three-heading">
          <h2>ອັບເດດຈາກທີມ</h2>
          <Badge variant="secondary">{items.length} ລາຍການ</Badge>
        </div>
      )}
      {[...groups.entries()].map(([key, group]) => (
        <section key={key} className="timeline-three-group" aria-label={group.label}>
          <Marker variant="separator">
            <MarkerContent>{group.label}</MarkerContent>
          </Marker>
          <ol className="timeline-three-list">
            {group.items.map((item) => (
              <TimelineEntry key={item.id} item={item} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
