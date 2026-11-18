import { useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Building2, Check, Search, UserRound, UsersRound, X } from "lucide-react";
import { taskOptionsSchema, type TaskOptions } from "@lapnet/contracts";
import { Skeleton } from "@/components/ui/skeleton";
import { useTaskData } from "./api";
import { t } from "@/i18n/lo";
import "./assignment.css";

export type AssignmentPerson = TaskOptions["users"][number];
export type AssignmentDepartment = TaskOptions["taggableDepartments"][number] & {
  active?: boolean;
};
export type TaskAssignment = {
  assigneeId: string;
  collaboratorIds: string[];
  taggedDepartmentIds: string[];
};
type Props = {
  value: TaskAssignment;
  people: AssignmentPerson[];
  departments: AssignmentDepartment[];
  taskId?: string;
  disabled: boolean;
  onChange: (value: TaskAssignment, people: AssignmentPerson[]) => void;
};

const uniquePeople = (people: AssignmentPerson[]) => [
  ...new Map(people.map((person) => [person.id, person])).values(),
];
const initials = (name: string) => Array.from(name.trim()).slice(0, 2).join("").toUpperCase();

export function TaskAssignmentPicker(props: Props) {
  const [open, setOpen] = useState(false),
    [applied, setApplied] = useState(false);
  const assignee = props.people.find((person) => person.id === props.value.assigneeId);
  const collaborators = props.people.filter((person) =>
    props.value.collaboratorIds.includes(person.id),
  );
  const divisions = props.departments.filter((department) =>
    props.value.taggedDepartmentIds.includes(department.id),
  );
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <section
        className="assignment-summary"
        aria-label="ການມອບໝາຍວຽກ"
        data-applied={applied || undefined}
      >
        <div className="assignment-summary-head">
          <div>
            <h3>ມອບໝາຍວຽກ</h3>
            <p>ເລືອກຜູ້ຮັບຜິດຊອບ ແລະ ທີມຮ່ວມວຽກ</p>
          </div>
          <Dialog.Trigger asChild>
            <button type="button" className="button secondary" disabled={props.disabled}>
              <UsersRound size={17} aria-hidden="true" /> ຈັດການມອບໝາຍ
            </button>
          </Dialog.Trigger>
        </div>
        <div className="assignment-primary-summary">
          <span className="assignment-avatar" aria-hidden="true">
            {initials(assignee?.displayName ?? "?")}
          </span>
          <div>
            <strong>{assignee?.displayName ?? "—"}</strong>
            <small>ຜູ້ຮັບຜິດຊອບຫຼັກ</small>
          </div>
          {applied && (
            <span className="assignment-applied" role="status">
              <Check size={14} aria-hidden="true" /> ເລືອກແລ້ວ
            </span>
          )}
        </div>
        {!!(collaborators.length || divisions.length) && (
          <div className="assignment-tags">
            {collaborators.map((person) => (
              <span key={person.id}>
                <UserRound size={13} aria-hidden="true" />
                {person.displayName}
              </span>
            ))}
            {divisions.map((department) => (
              <span key={department.id}>
                <Building2 size={13} aria-hidden="true" />
                {t(department.name)}
              </span>
            ))}
          </div>
        )}
        <p className="task-help">
          {props.value.collaboratorIds.length} ຜູ້ຮ່ວມວຽກ · {props.value.taggedDepartmentIds.length}{" "}
          ພະແນກ
        </p>
      </section>
      {open && (
        <AssignmentDialog
          {...props}
          onCancel={() => setOpen(false)}
          onApply={(next, people) => {
            props.onChange(next, people);
            setApplied(true);
            setOpen(false);
          }}
        />
      )}
    </Dialog.Root>
  );
}

function AssignmentDialog({
  value,
  people: initialPeople,
  departments: initialDepartments,
  taskId,
  onCancel,
  onApply,
}: Props & {
  onCancel: () => void;
  onApply: (value: TaskAssignment, people: AssignmentPerson[]) => void;
}) {
  const id = useId(),
    searchRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<TaskAssignment>(() => ({
    ...value,
    collaboratorIds: [...value.collaboratorIds],
    taggedDepartmentIds: [...value.taggedDepartmentIds],
  }));
  const [tab, setTab] = useState<"people" | "divisions">("people");
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState("");
  const [departmentId, setDepartmentId] = useState(""),
    [cursors, setCursors] = useState<string[]>([]);
  const [known, setKnown] = useState(initialPeople),
    [error, setError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const params = new URLSearchParams({ limit: "25", q: tab === "people" ? query : "" });
  if (taskId) params.set("taskId", taskId);
  if (departmentId && tab === "people") params.set("departmentId", departmentId);
  if (cursors.length && tab === "people") params.set("cursor", cursors.at(-1)!);
  const {
    data,
    loading,
    error: lookupError,
    reload,
  } = useTaskData("/api/v1/tasks/options?" + params, taskOptionsSchema);
  const pending = loading || (tab === "people" && query !== search.trim());
  const people = uniquePeople([...known, ...(data?.users ?? [])]);
  const departments = [
    ...new Map<string, AssignmentDepartment>(
      [...initialDepartments, ...(data?.taggableDepartments ?? [])].map((department) => [
        department.id,
        department,
      ]),
    ).values(),
  ];
  const primary = people.find((person) => person.id === draft.assigneeId);
  const selected = people.filter((person) => draft.collaboratorIds.includes(person.id));
  const selectedDepartments = departments.filter((department) =>
    draft.taggedDepartmentIds.includes(department.id),
  );
  const filteredDepartments = departments.filter((department) =>
    `${t(department.name)} ${department.name} ${department.code}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  function remember(person: AssignmentPerson) {
    setKnown((old) => uniquePeople([...old, person]));
    setError("");
  }
  function togglePerson(person: AssignmentPerson) {
    remember(person);
    if (!draft.collaboratorIds.includes(person.id) && draft.collaboratorIds.length >= 25) {
      setError("ເລືອກຜູ້ຮ່ວມວຽກໄດ້ສູງສຸດ 25 ຄົນ.");
      return;
    }
    setDraft((old) => ({
      ...old,
      collaboratorIds: old.collaboratorIds.includes(person.id)
        ? old.collaboratorIds.filter((key) => key !== person.id)
        : [...old.collaboratorIds, person.id],
    }));
  }
  function toggleDepartment(department: AssignmentDepartment) {
    if (
      !draft.taggedDepartmentIds.includes(department.id) &&
      draft.taggedDepartmentIds.length >= 25
    ) {
      setError("ເລືອກໄດ້ສູງສຸດ 25 ພະແນກ.");
      return;
    }
    setError("");
    setDraft((old) => ({
      ...old,
      taggedDepartmentIds: old.taggedDepartmentIds.includes(department.id)
        ? old.taggedDepartmentIds.filter((key) => key !== department.id)
        : [...old.taggedDepartmentIds, department.id],
    }));
  }
  function changeTab(next: typeof tab) {
    setTab(next);
    setSearch("");
    setQuery("");
    setCursors([]);
  }
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="assignment-overlay" />
      <Dialog.Content
        className="assignment-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <header className="assignment-header">
          <span className="assignment-mark">
            <UsersRound size={22} aria-hidden="true" />
          </span>
          <div>
            <Dialog.Title>ມອບໝາຍວຽກ</Dialog.Title>
            <Dialog.Description>ເລືອກຄົນ ຫຼື ພະແນກເຂົ້າຮ່ວມວຽກດຽວກັນ</Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <button type="button" className="assignment-close" aria-label="ປິດການມອບໝາຍ">
              <X size={20} aria-hidden="true" />
            </button>
          </Dialog.Close>
        </header>
        <div className="assignment-layout">
          <section className="assignment-directory" aria-label="ຄົ້ນຫາທີມ">
            <div role="tablist" className="assignment-tabs" aria-label="ປະເພດການມອບໝາຍ">
              {(
                [
                  ["people", "ລາຍບຸກຄົນ", UserRound],
                  ["divisions", "ລາຍພະແນກ", Building2],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`${id}-${key}`}
                  aria-selected={tab === key}
                  aria-controls={`${id}-panel`}
                  tabIndex={tab === key ? 0 : -1}
                  onClick={() => changeTab(key)}
                  onKeyDown={(event) => {
                    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                      event.preventDefault();
                      const next =
                        event.key === "Home"
                          ? "people"
                          : event.key === "End"
                            ? "divisions"
                            : tab === "people"
                              ? "divisions"
                              : "people";
                      changeTab(next);
                      document.getElementById(`${id}-${next}`)?.focus();
                    }
                  }}
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            <div className="assignment-search">
              <label htmlFor={`${id}-search`}>
                {tab === "people" ? "ຄົ້ນຫາຊື່ ຫຼື username" : "ຄົ້ນຫາພະແນກ"}
              </label>
              <div>
                <Search size={17} aria-hidden="true" />
                <input
                  id={`${id}-search`}
                  ref={searchRef}
                  type="search"
                  value={search}
                  maxLength={100}
                  placeholder={tab === "people" ? "ຊື່ / username" : "ຊື່ / ລະຫັດພະແນກ"}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setCursors([]);
                  }}
                />
              </div>
              {tab === "people" && (
                <select
                  aria-label="ກອງຕາມພະແນກ"
                  value={departmentId}
                  onChange={(event) => {
                    setDepartmentId(event.target.value);
                    setCursors([]);
                  }}
                >
                  <option value="">ທຸກພະແນກ</option>
                  {departments
                    .filter((department) => department.active !== false)
                    .map((department) => (
                      <option key={department.id} value={department.id}>
                        {t(department.name)}
                      </option>
                    ))}
                </select>
              )}
            </div>
            <div
              id={`${id}-panel`}
              role="tabpanel"
              aria-labelledby={`${id}-${tab}`}
              className="assignment-results"
              aria-busy={pending}
            >
              {pending ? (
                <Skeleton variant="rows" rows={4} />
              ) : lookupError ? (
                <div className="identity-error" role="alert">
                  <p>{lookupError}</p>
                  <button type="button" className="button secondary" onClick={reload}>
                    ລອງໃໝ່
                  </button>
                </div>
              ) : tab === "people" ? (
                <>
                  {(data?.users ?? []).map((person) => {
                    const isPrimary = draft.assigneeId === person.id,
                      isMember = draft.collaboratorIds.includes(person.id);
                    return (
                      <div
                        className="assignment-person-row"
                        key={person.id}
                        data-selected={isPrimary || isMember || undefined}
                      >
                        <span className="assignment-avatar" aria-hidden="true">
                          {initials(person.displayName)}
                        </span>
                        <div className="assignment-person-name">
                          <strong>{person.displayName}</strong>
                          <small>@{person.username}</small>
                          <small>
                            {person.departments
                              .map((department) => t(department.name))
                              .join(" · ") || "ບໍ່ມີພະແນກ"}
                          </small>
                        </div>
                        <div className="assignment-person-actions">
                          <button
                            type="button"
                            aria-pressed={isPrimary}
                            aria-label={`ມອບໝາຍ ${person.displayName} ເປັນຜູ້ຮັບຜິດຊອບຫຼັກ`}
                            onClick={() => {
                              remember(person);
                              setDraft((old) => ({
                                ...old,
                                assigneeId: person.id,
                                collaboratorIds: old.collaboratorIds.filter(
                                  (key) => key !== person.id,
                                ),
                              }));
                            }}
                          >
                            {isPrimary && <Check size={13} aria-hidden="true" />}ຫຼັກ
                          </button>
                          <button
                            type="button"
                            aria-pressed={isMember}
                            aria-label={`ເລືອກ ${person.displayName} ເປັນຜູ້ຮ່ວມວຽກ`}
                            disabled={isPrimary}
                            onClick={() => togglePerson(person)}
                          >
                            {isMember && <Check size={13} aria-hidden="true" />}ຮ່ວມ
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {!data?.users.length && (
                    <p className="assignment-empty" role="status">
                      ບໍ່ພົບຜູ້ໃຊ້. ລອງປ່ຽນຊື່ ຫຼື ພະແນກ.
                    </p>
                  )}
                  {(cursors.length > 0 || data?.nextCursor) && (
                    <div className="task-pagination">
                      <button
                        type="button"
                        className="button secondary"
                        disabled={!cursors.length}
                        onClick={() => setCursors(cursors.slice(0, -1))}
                      >
                        ກ່ອນໜ້າ
                      </button>
                      <span>{cursors.length + 1}</span>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={!data?.nextCursor}
                        onClick={() => {
                          if (data?.nextCursor) setCursors([...cursors, data.nextCursor]);
                        }}
                      >
                        ຖັດໄປ
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {filteredDepartments.map((department) => (
                    <label
                      className="assignment-department-row"
                      key={department.id}
                      data-selected={draft.taggedDepartmentIds.includes(department.id) || undefined}
                    >
                      <span className="assignment-avatar" aria-hidden="true">
                        <Building2 size={18} />
                      </span>
                      <span>
                        <strong>{t(department.name)}</strong>
                        <small>
                          {department.code}
                          {department.active === false ? " · ປິດໃຊ້ງານ" : ""}
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        aria-label={`ມອບໝາຍໃຫ້ພະແນກ ${t(department.name)}`}
                        checked={draft.taggedDepartmentIds.includes(department.id)}
                        disabled={
                          department.active === false &&
                          !draft.taggedDepartmentIds.includes(department.id)
                        }
                        onChange={() => toggleDepartment(department)}
                      />
                    </label>
                  ))}
                  {!filteredDepartments.length && (
                    <p className="assignment-empty" role="status">
                      ບໍ່ພົບພະແນກທີ່ກົງກັນ.
                    </p>
                  )}
                </>
              )}
            </div>
          </section>
          <aside className="assignment-selection" aria-label="ສະຫຼຸບການມອບໝາຍ">
            <h3>ທີມທີ່ເລືອກ</h3>
            <div className="assignment-lead">
              <small>ຜູ້ຮັບຜິດຊອບຫຼັກ</small>
              <strong>{primary?.displayName ?? "—"}</strong>
            </div>
            <p className="assignment-selection-count" role="status">
              {draft.collaboratorIds.length} ຜູ້ຮ່ວມວຽກ · {draft.taggedDepartmentIds.length} ພະແນກ
            </p>
            <div className="assignment-selected-list">
              {selected.map((person) => (
                <div key={person.id}>
                  <UserRound size={15} aria-hidden="true" />
                  <span>{person.displayName}</span>
                  <button
                    type="button"
                    aria-label={`ເອົາ ${person.displayName} ອອກ`}
                    onClick={() => togglePerson(person)}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {selectedDepartments.map((department) => (
                <div key={department.id}>
                  <Building2 size={15} aria-hidden="true" />
                  <span>{t(department.name)}</span>
                  <button
                    type="button"
                    aria-label={`ເອົາພະແນກ ${t(department.name)} ອອກ`}
                    onClick={() => toggleDepartment(department)}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            <p className="task-help">
              ສະມາຊິກພະແນກທີ່ເລືອກຈະຮ່ວມອັບເດດວຽກໄດ້. ການເລືອກພະແນກບໍ່ປ່ຽນຜູ້ຮັບຜິດຊອບຫຼັກ.
            </p>
          </aside>
        </div>
        <footer className="assignment-footer">
          <div>
            <p>ນຳໃຊ້ແລ້ວກົດບັນທຶກວຽກ ເພື່ອສົ່ງການມອບໝາຍ</p>
            {error && (
              <p className="assignment-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div>
            <button type="button" className="button secondary" onClick={onCancel}>
              ຍົກເລີກ
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!primary || primary.status !== "active"}
              onClick={() => onApply(draft, people)}
            >
              ນຳໃຊ້ການເລືອກ
            </button>
          </div>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
