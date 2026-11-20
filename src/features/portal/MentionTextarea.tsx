import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Building2, UserRound, X } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { errorText } from "../identity/Auth";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n/lo";
import {
  insertMention,
  mentionQuery,
  reconcileMentions,
  removeMention,
  selectedMentions,
  type MentionQuery,
  type MentionToken,
  type SelectedMention,
} from "./mention-text";
import "./mentions.css";

type Targets = {
  users: { id: string; displayName: string }[];
  departments: { id: string; name: string }[];
};
export type MentionTextareaHandle = { mention: (person: SelectedMention) => void };

export function MentionTextarea({
  resourceId,
  label,
  value,
  onChange,
  onMentionsChange,
  canInvite,
  ref,
}: {
  resourceId: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  onMentionsChange: (mentions: SelectedMention[]) => void;
  canInvite: boolean;
  ref?: Ref<MentionTextareaHandle>;
}) {
  const id = useId(),
    input = useRef<HTMLTextAreaElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const dismissed = useRef("");
  const [tokens, setTokens] = useState<MentionToken[]>([]),
    [active, setActive] = useState<MentionQuery | null>(null);
  const [highlight, setHighlight] = useState(0),
    [epoch, setEpoch] = useState(0),
    [validation, setValidation] = useState("");
  const [result, setResult] = useState<{
    key: string;
    items: SelectedMention[];
    error: string;
  } | null>(null);
  const query = active?.query,
    open = active !== null,
    key = `${resourceId}\0${query}\0${epoch}`;
  const ready = result?.key === key,
    items = ready ? result.items : [],
    loading = open && !ready;
  const selected = value ? selectedMentions(tokens) : [];
  useEffect(() => {
    if (!value) {
      setTokens([]);
      setActive(null);
    }
  }, [value]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        apiRequest<Targets>(
          `/api/v1/mention-targets?resourceId=${resourceId}&q=${encodeURIComponent(query ?? "")}`,
          "GET",
          undefined,
          controller.signal,
        )
          .then((data) => {
            if (controller.signal.aborted) return;
            setResult({
              key,
              error: "",
              items: [
                ...data.users.map((user) => ({
                  type: "user" as const,
                  id: user.id,
                  name: user.displayName,
                })),
                ...data.departments.map((department) => ({
                  type: "department" as const,
                  id: department.id,
                  name: t(department.name),
                })),
              ],
            });
          })
          .catch((error) => {
            if (!controller.signal.aborted) setResult({ key, items: [], error: errorText(error) });
          });
      },
      query ? 180 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [resourceId, query, open, key]);
  useEffect(() => {
    const list = menu.current?.querySelector<HTMLElement>("[role=listbox]"),
      option = document.getElementById(`${id}-option-${highlight}`);
    if (!list || !option) return;
    const top = option.offsetTop,
      bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight;
  }, [highlight, items.length, id]);
  function dismiss() {
    if (active) dismissed.current = `${active.start}:${active.end}:${active.query}`;
    setActive(null);
  }
  function detect(text: string, caret: number, current = tokens) {
    const found = mentionQuery(text, caret);
    const signature = found ? `${found.start}:${found.end}:${found.query}` : "";
    if (
      current.some((token) => token.start < caret && caret <= token.end) ||
      signature === dismissed.current
    ) {
      setActive(null);
      return;
    }
    setActive(found);
    setHighlight(0);
  }
  function commit(next: { text: string; tokens: MentionToken[] }) {
    setTokens(next.tokens);
    onChange(next.text);
    onMentionsChange(selectedMentions(next.tokens));
    setValidation("");
  }
  function choose(person: SelectedMention, append = false) {
    const text = append && /\S$/u.test(value) ? value + " " : value;
    const query = append ? { start: text.length, end: text.length, query: "" } : active;
    if (!query || !input.current || input.current.matches(":disabled")) return;
    if (
      selected.length >= 25 &&
      !selected.some((item) => item.type === person.type && item.id === person.id)
    ) {
      setValidation("ກ່າວເຖິງໄດ້ສູງສຸດ 25 ລາຍການ.");
      return;
    }
    const next = insertMention(text, tokens, query, person);
    if (!next) {
      setValidation("ຂໍ້ຄວາມຕ້ອງບໍ່ເກີນ 4,000 ຕົວອັກສອນ.");
      return;
    }
    commit(next);
    setActive(null);
    dismissed.current = "";
    requestAnimationFrame(() => {
      input.current?.focus({ preventScroll: true });
      input.current?.setSelectionRange(next.caret, next.caret);
      if (append) input.current?.scrollIntoView({ block: "nearest" });
    });
  }
  useImperativeHandle(ref, () => ({ mention: (person) => choose(person, true) }));
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <div className="mention-composer">
        <label htmlFor={id}>{label}</label>
        <Popover.Anchor asChild>
          <textarea
            id={id}
            ref={input}
            value={value}
            required
            maxLength={4000}
            rows={3}
            aria-autocomplete="list"
            aria-controls={open ? `${id}-list` : undefined}
            aria-activedescendant={
              open && items.length
                ? `${id}-option-${Math.min(highlight, items.length - 1)}`
                : undefined
            }
            aria-describedby={`${id}-help`}
            onChange={(event) => {
              const next = event.currentTarget.value,
                current = reconcileMentions(value, next, tokens);
              commit({ text: next, tokens: current });
              dismissed.current = "";
              detect(next, event.currentTarget.selectionStart, current);
            }}
            onSelect={(event) => {
              const field = event.currentTarget;
              if (field.selectionStart === field.selectionEnd)
                detect(field.value, field.selectionStart);
              else setActive(null);
            }}
            onKeyDown={(event) => {
              if (!open || event.nativeEvent.isComposing) return;
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                dismiss();
              } else if (items.length && ["ArrowDown", "ArrowUp"].includes(event.key)) {
                event.preventDefault();
                setHighlight(
                  (index) =>
                    (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length,
                );
              } else if (items.length && event.key === "Enter") {
                event.preventDefault();
                choose(items[Math.min(highlight, items.length - 1)]);
              } else if (event.key === "Tab") dismiss();
            }}
          />
        </Popover.Anchor>
        {selected.length > 0 && (
          <div className="mention-chips">
            {selected.map((person) => (
              <button
                type="button"
                key={person.type + person.id}
                aria-label={`ເອົາ ${person.name} ອອກຈາກ tag`}
                onClick={() => {
                  commit(removeMention(value, tokens, person));
                  setActive(null);
                  input.current?.focus({ preventScroll: true });
                }}
              >
                <span>@{person.name}</span>
                <X size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        <p id={`${id}-help`} className="task-help">
          ພິມ @ ເພື່ອເລືອກຄົນ ຫຼື ພະແນກ.{" "}
          {canInvite ? "Host ເຊີນຜູ້ທີ່ tag ເຂົ້າທີມໄດ້." : "ແຈ້ງຄົນທີ່ມີສິດໃນວຽກ; ໃຫ້ Host ເຊີນຄົນໃໝ່."}
        </p>
        {validation && (
          <p className="identity-error" role="alert">
            {validation}
          </p>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content
          ref={menu}
          className="mention-menu"
          role="presentation"
          sideOffset={6}
          align="start"
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (input.current?.contains(event.target as Node)) event.preventDefault();
          }}
        >
          <div className="mention-menu-heading">
            ຄົນ ແລະ ພະແນກ<span>↑ ↓ · Enter</span>
          </div>
          {loading && <Skeleton variant="card" rows={1} label="ກຳລັງຄົ້ນຫາລາຍຊື່..." />}
          {ready && result.error && (
            <div className="mention-error" role="alert">
              <p>{result.error}</p>
              <button
                className="button secondary"
                type="button"
                onClick={() => setEpoch((value) => value + 1)}
              >
                ລອງໃໝ່
              </button>
            </div>
          )}
          <div id={`${id}-list`} role="listbox" aria-label="ຜູ້ຮັບການກ່າວເຖິງ" aria-busy={loading}>
            {items.map((person, index) => {
              const Icon = person.type === "user" ? UserRound : Building2;
              return (
                <button
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={highlight === index}
                  tabIndex={-1}
                  type="button"
                  key={person.type + person.id}
                  onPointerDown={(event) => event.preventDefault()}
                  onPointerMove={() => setHighlight(index)}
                  onClick={() => choose(person)}
                >
                  <span className="mention-option-icon">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{person.name}</strong>
                    <small>{person.type === "user" ? "ບຸກຄົນ" : "ພະແນກ"}</small>
                  </span>
                </button>
              );
            })}
          </div>
          {ready && !result.error && !items.length && (
            <p className="mention-no-results">ບໍ່ພົບລາຍຊື່ທີ່ກົງກັນ.</p>
          )}
          <span className="sr-only" role="status">
            {ready && !result.error ? `${items.length} ລາຍການ` : ""}
          </span>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
