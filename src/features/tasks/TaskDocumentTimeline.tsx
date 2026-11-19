import { FileText, Link2, Upload } from "lucide-react";
import { taskDocumentsSchema } from "@lapnet/contracts";
import {
  Timeline,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline";
import { formatLaoTimestamp } from "@/i18n/lo-date";
import { fmtBytes } from "../document-workspace/lib/format";

type Activity = ReturnType<typeof taskDocumentsSchema.parse>["activity"];
const states: Record<string, string> = {
  quarantined: "ກຳລັງກວດໄຟລ໌",
  available: "ພ້ອມໃຊ້ງານ",
  scan_failed: "ກວດໄຟລ໌ບໍ່ສຳເລັດ",
  rejected: "ໄຟລ໌ບໍ່ຜ່ານການກວດ",
};
export function TaskDocumentTimeline({
  activity,
  go,
}: {
  activity: Activity;
  go: (path: string) => void;
}) {
  return (
    <Timeline
      value={activity.length}
      className="task-file-timeline"
      aria-label="Timeline ການອັບໂຫຼດເອກະສານ"
      role="list"
    >
      {activity.map((event, index) => {
        const Icon = event.kind === "linked" ? Link2 : Upload;
        return (
          <TimelineItem key={event.id} step={index + 1} className="task-file-event" role="listitem">
            <TimelineHeader>
              <TimelineSeparator />
              <TimelineIndicator>
                <Icon size={12} aria-hidden="true" />
              </TimelineIndicator>
              <div className="task-file-event-card">
                <TimelineDate dateTime={event.occurredAt}>
                  {formatLaoTimestamp(event.occurredAt)}
                </TimelineDate>
                <TimelineTitle>{event.actorName ?? "ບໍ່ລະບຸຜູ້ສົ່ງ"}</TimelineTitle>
                <p className="task-file-event-action">
                  {event.kind === "linked"
                    ? "ເຊື່ອມເອກະສານເຂົ້າວຽກ"
                    : `ອັບໂຫຼດເອກະສານ · ສະບັບ ${event.version}`}
                </p>
                <button
                  className="task-file-event-document"
                  type="button"
                  disabled={!event.href}
                  onClick={() => {
                    if (event.href) go(event.href);
                  }}
                >
                  <FileText size={20} aria-hidden="true" />
                  <span>
                    <strong>{event.filename ?? event.title}</strong>
                    {event.filename && event.filename !== event.title && (
                      <small>{event.title}</small>
                    )}
                  </span>
                </button>
                <div className="task-file-event-status">
                  {event.bytes != null && <span>{fmtBytes(event.bytes)}</span>}
                  {event.state && (
                    <span data-file-state={event.state}>{states[event.state] ?? event.state}</span>
                  )}
                </div>
              </div>
            </TimelineHeader>
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}
