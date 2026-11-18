import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";
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
              <li key={item.id} className="timeline-three-item">
                <span className="timeline-three-avatar">
                  <Avatar className="size-9 border border-border">
                    <AvatarImage src={item.avatar} alt="" />
                    <AvatarFallback>
                      {item.actor
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((s) => Array.from(s)[0])
                        .join("")
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="timeline-three-icon">
                    <MessageCircle size={10} aria-hidden="true" />
                  </span>
                </span>
                <div className="timeline-three-content">
                  <div className="timeline-three-byline">
                    <div>
                      <strong>{item.actor}</strong>
                      {item.meta && <small>{item.meta}</small>}
                    </div>
                    <time
                      dateTime={item.createdAt}
                      title={
                        date.format(new Date(item.createdAt)) +
                        " " +
                        time.format(new Date(item.createdAt))
                      }
                    >
                      {time.format(new Date(item.createdAt))}
                      {item.edited ? " · ແກ້ໄຂແລ້ວ" : ""}
                    </time>
                  </div>
                  <div className="timeline-three-body">{item.content}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
