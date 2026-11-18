import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { commentsSchema } from "@lapnet/contracts";
import Timeline3 from "@/components/ui/timeline-3";
import { useAuth } from "../identity/Auth";
import { ArrowUpRight, MessageSquare } from "lucide-react";
import { apiRequest } from "../../lib/api";
import { useTaskData, timeLabel } from "../tasks/api";
import { t } from "../../i18n/lo";
import { formatLaoTimestamp } from "../../i18n/lo-date";
import { Loading, Pager, SimpleForm, value, useWrite, Failure } from "./common";
export type Mention = { type: "user" | "department" | "position"; id: string };
export type SelectedMention = Mention & { name: string };
const targetSchema = {
  parse(value: unknown) {
    return value as {
      users: { id: string; displayName: string }[];
      departments: { id: string; name: string }[];
      positions: { id: string; label: string }[];
    };
  },
};
export function Mentions({
  selected,
  set,
  userOnly = false,
  taskContext = false,
  taskInvite = false,
}: {
  selected: SelectedMention[];
  set: (items: SelectedMention[]) => void;
  userOnly?: boolean;
  taskContext?: boolean;
  taskInvite?: boolean;
}) {
  const [q, setQ] = useState("");
  const { data, loading, error, reload } = useTaskData(
    "/api/v1/mention-targets?q=" + encodeURIComponent(q),
    targetSchema,
  );
  const items = data
    ? [
        ...data.users.map((x) => ({ type: "user" as const, id: x.id, name: x.displayName })),
        ...(!userOnly
          ? [
              ...data.departments.map((x) => ({
                type: "department" as const,
                id: x.id,
                name: t(x.name),
              })),
              ...(!taskContext ? data.positions : []).map((x) => ({
                type: "position" as const,
                id: x.id,
                name: t(x.label),
              })),
            ]
          : []),
      ]
    : [];
  return (
    <div>
      <label>
        {userOnly ? "ຜູ້ເຂົ້າຮ່ວມພາຍໃນ" : "@ ກ່າວເຖິງ"}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ຄົ້ນຫາຄົນ / CEO / CFO / ພະແນກ"
          maxLength={100}
        />
      </label>
      <Loading loading={loading} error={error} reload={reload} />
      {data && (
        <select
          aria-label={userOnly ? "ເພີ່ມຜູ້ເຂົ້າຮ່ວມ" : "ເພີ່ມການກ່າວເຖິງ"}
          value=""
          disabled={selected.length >= 25}
          onChange={(e) => {
            const item = items.find((x) => x.type + ":" + x.id === e.target.value);
            if (item && !selected.some((x) => x.type === item.type && x.id === item.id))
              set([...selected, item]);
          }}
        >
          <option value="">ເລືອກ</option>
          {items.map((x) => (
            <option key={x.type + x.id} value={x.type + ":" + x.id}>
              {x.name}
            </option>
          ))}
        </select>
      )}
      <div className="portal-tags">
        {selected.map((x) => (
          <button
            type="button"
            className="portal-tag"
            key={x.type + x.id}
            onClick={() => set(selected.filter((y) => y !== x))}
          >
            @{x.name} ×
          </button>
        ))}
      </div>
      {!userOnly && (
        <p className="task-help">
          {taskContext
            ? taskInvite
              ? "Host @tag ຄົນ ຫຼື ພະແນກເພື່ອເຊີນເຂົ້າທີມ. ຜູ້ທີ່ເຊີນຈະເບິ່ງ, ອັບເດດ ແລະ ຂຽນຄວາມຄືບໜ້າໄດ້."
              : "@tag ເພື່ອແຈ້ງຄົນທີ່ມີສິດໃນວຽກ. ໃຫ້ Host ເຊີນຄົນ ຫຼື ພະແນກໃໝ່."
            : "ການ @ ບໍ່ໄດ້ແບ່ງປັນສິດ ຫຼື ມອບໝາຍວຽກ. ຜູ້ຮັບຕ້ອງມີສິດເບິ່ງກ່ອນ."}
        </p>
      )}
    </div>
  );
}
export function Comments({
  id,
  canComment,
  taskStyle = false,
  onOpen,
  canInvite = false,
  onChanged,
}: {
  id: string;
  canComment: boolean;
  taskStyle?: boolean;
  onOpen?: () => void;
  canInvite?: boolean;
  onChanged?: () => void;
}) {
  const { me } = useAuth();
  const preview = !!onOpen;
  const [cursors, setCursors] = useState<string[]>([]);
  const [editing, setEditing] = useState("");
  const [mentions, setMentions] = useState<SelectedMention[]>([]);
  const [draft, setDraft] = useState("");
  const path = `/api/v1/resources/${id}/comments`;
  const { data, loading, error, reload } = useTaskData(
    `${path}?limit=${preview ? 2 : 15}${cursors.length ? "&cursor=" + cursors.at(-1) : ""}`,
    commentsSchema,
  );
  const composer = canComment && !preview && (
    <SimpleForm
      onSave={async () => {
        await apiRequest(path, "POST", {
          text: draft,
          mentions: mentions.map(({ type, id }) => ({ type, id })),
        });
        setDraft("");
        setMentions([]);
        setCursors([]);
        reload();
        onChanged?.();
      }}
    >
      <label>
        {taskStyle ? "ລາຍງານຄວາມຄືບໜ້າ" : "ຂຽນຄວາມຄິດເຫັນ"}
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          required
          maxLength={4000}
          rows={3}
        />
      </label>
      {taskStyle ? (
        <details>
          <summary>@ ກ່າວເຖິງຄົນ ຫຼື ພະແນກ</summary>
          <Mentions
            selected={mentions}
            set={setMentions}
            taskContext={taskStyle}
            taskInvite={canInvite}
          />
        </details>
      ) : (
        <Mentions
          selected={mentions}
          set={setMentions}
          taskContext={taskStyle}
          taskInvite={canInvite}
        />
      )}
    </SimpleForm>
  );
  const renderContent = (row: ReturnType<typeof commentsSchema.parse>["items"][number]) => (
    <>
      {editing === row.id ? (
        <SimpleForm
          onSave={async (form) => {
            await apiRequest(`${path}/${row.id}`, "PATCH", {
              text: value(form, "text"),
              revision: row.revision,
            });
            setEditing("");
            reload();
          }}
        >
          <textarea name="text" defaultValue={row.text} required maxLength={4000} />
          <button type="button" className="button ghost" onClick={() => setEditing("")}>
            ຍົກເລີກ
          </button>
        </SimpleForm>
      ) : (
        <>
          <p className={preview ? "task-comment-preview" : "task-description"}>{row.text}</p>
          {row.canEdit && canComment && !preview && (
            <div className="form-actions">
              <button className="text-button" type="button" onClick={() => setEditing(row.id)}>
                ແກ້ໄຂ
              </button>
              <ArchiveComment
                path={`${path}/${row.id}/archive`}
                text={row.text}
                revision={row.revision}
                onArchived={reload}
              />
            </div>
          )}
        </>
      )}
    </>
  );
  return (
    <section className={taskStyle ? "task-workspace-section task-discussion" : "panel"}>
      <div className={taskStyle ? "task-section-heading" : undefined}>
        <h2>{taskStyle ? (preview ? "ອັບເດດຈາກທີມຫຼ້າສຸດ" : "ອັບເດດຈາກທີມ") : "ຄວາມຄິດເຫັນ"}</h2>
        {onOpen && (
          <button className="text-button" type="button" onClick={onOpen}>
            ເບິ່ງທັງໝົດ <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <Loading loading={loading} error={error} reload={reload} />
      {taskStyle && composer}
      {taskStyle && data && (
        <Timeline3
          showHeader={false}
          items={data.items.map((row) => ({
            id: row.id,
            actor: row.author.displayName,
            avatar: row.author.id === me?.user.id ? (me.user.avatarUrl ?? undefined) : undefined,
            createdAt: row.createdAt,
            edited: row.revision > 1,
            meta: row.author.departments.map(t).join(" · "),
            content: renderContent(row),
          }))}
        />
      )}
      {!taskStyle &&
        data?.items.map((row) => (
          <article
            className={taskStyle ? "task-event-row task-comment" : "portal-comment"}
            data-tone="comment"
            key={row.id}
          >
            {taskStyle && (
              <span className="task-row-icon">
                <MessageSquare size={17} aria-hidden="true" />
              </span>
            )}
            <div className="task-row-content">
              <header>
                <strong>{row.author.displayName}</strong>
                {taskStyle && !!row.author.departments.length && (
                  <small>{row.author.departments.map(t).join(" · ")}</small>
                )}
                {!taskStyle && <time dateTime={row.createdAt}>{timeLabel(row.createdAt)}</time>}
              </header>
              {renderContent(row)}
            </div>
            {taskStyle && (
              <time dateTime={row.createdAt}>
                {formatLaoTimestamp(row.createdAt)}
                {row.revision > 1 ? " · ແກ້ໄຂແລ້ວ" : ""}
              </time>
            )}
          </article>
        ))}
      {data && !data.items.length && (
        <p className={taskStyle ? "task-documents-empty" : "muted"}>
          {taskStyle && <MessageSquare size={18} aria-hidden="true" />}ຍັງບໍ່ມີຄວາມຄິດເຫັນ
        </p>
      )}
      {data && !preview && (cursors.length > 0 || data.nextCursor) && (
        <Pager next={data.nextCursor} cursors={cursors} set={setCursors} />
      )}
      {!taskStyle && composer}
    </section>
  );
}

function ArchiveComment({
  path,
  text,
  revision,
  onArchived,
}: {
  path: string;
  text: string;
  revision: number;
  onArchived: () => void;
}) {
  const { busy, error, run } = useWrite();
  return (
    <div>
      <button
        className="text-button"
        type="button"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await apiRequest(path, "POST", { text, revision });
            onArchived();
          })
        }
      >
        {busy && <Skeleton variant="inline" />}ເກັບເຂົ້າຄັງ
      </button>
      <Failure error={error} />
    </div>
  );
}
