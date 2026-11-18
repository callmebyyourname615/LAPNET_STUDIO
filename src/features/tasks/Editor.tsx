import { Skeleton } from "../../components/ui/skeleton";
import { useEffect, useState, type FormEvent } from "react";
import {
  taskOptionsSchema,
  taskPriorities,
  taskSchema,
  type TaskOptions,
  type TaskRecord,
  type TaskWrite,
} from "@lapnet/contracts";
import { apiRequest, ApiError } from "../../lib/api";
import { errorText, useAuth } from "../identity/Auth";
import { priorityNames } from "./api";
import { t } from "../../i18n/lo";

type Person = TaskOptions["users"][number];
export function TaskEditor({
  task,
  onSaved,
  onCancel,
  sourceInteractionId,
}: {
  task?: TaskRecord;
  sourceInteractionId?:string;
  onSaved: (task: TaskRecord) => void;
  onCancel: () => void;
}) {
  const { me } = useAuth();
  const self: Person = { id: me!.user.id, displayName: me!.user.displayName, status: "active" };
  const [title, setTitle] = useState(task?.title ?? ""),
    [description, setDescription] = useState(task?.description ?? ""),
    [priority, setPriority] = useState<TaskWrite["priority"]>(task?.priority ?? "normal"),
    [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [departmentId, setDepartment] = useState(
    task?.department.id ?? me?.memberships[0]?.department.id ?? "",
  );
  const [assigneeId, setAssignee] = useState(task?.assignee.id ?? self.id),
    [collaboratorIds, setCollaborators] = useState(task?.collaborators.map((p) => p.id) ?? []);
  const [share, setShare] = useState(false),
    [search, setSearch] = useState(""),
    [options, setOptions] = useState<TaskOptions | null>(null),
    [people, setPeople] = useState<Person[]>([
      ...new Map(
        [self, ...(task ? [task.assignee, ...task.collaborators] : [])].map((person) => [
          person.id,
          person,
        ]),
      ).values(),
    ]);
  const [error, setError] = useState(""),
    [optionsError, setOptionsError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [conflict, setConflict] = useState(false);
  const canShare = !task || task.permissions.manageAccess;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setOptionsError("");
    const timer = setTimeout(
      () => {
        const q = new URLSearchParams({
          q: search,
          limit: "25",
          ...(task ? { taskId: task.id } : {}),
        });
        apiRequest("/api/v1/tasks/options?" + q, "GET", undefined, controller.signal)
          .then((value) => {
            if (controller.signal.aborted) return;
            const result = taskOptionsSchema.parse(value);
            setOptions(result);
            setPeople((old) => [
              ...new Map([...old, ...result.users].map((p) => [p.id, p])).values(),
            ]);
            setOptionsError("");
            setDepartment((old) => old || result.departments[0]?.id || "");
          })
          .catch((e) => {
            if (!controller.signal.aborted) setOptionsError(errorText(e));
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, task?.id]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || conflict) return;
    setError("");
    if (!task && !share && [assigneeId, ...collaboratorIds].some((id) => id !== self.id)) {
      setError("ກະລຸນາຢືນຢັນການແບ່ງປັນສິດໃຫ້ຜູ້ຮ່ວມວຽກທີ່ເລືອກ.");
      return;
    }
    setBusy(true);
    const fields: TaskWrite = {
      title: title.trim(),
      description,
      priority,
      dueDate: dueDate || null,
      assigneeId,
      collaboratorIds,
      shareParticipants: share,
    };
    try {
      const value = await apiRequest(
        task ? "/api/v1/tasks/" + task.id : sourceInteractionId ? `/api/v1/interactions/${sourceInteractionId}/follow-up-tasks` : "/api/v1/tasks",
        task ? "PATCH" : "POST",
        { ...fields, ...(task ? { revision: task.revision } : { departmentId }) },
      );
      onSaved(taskSchema.parse(value));
    } catch (e) {
      setConflict(e instanceof ApiError && e.status === 409);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (loading && !options)
    return (
      <section className="panel task-editor">
        <Skeleton variant="form" />
      </section>
    );
  const selected = new Set([assigneeId, ...collaboratorIds]);
  const displayed = [
    ...new Map(
      [...people.filter((p) => selected.has(p.id)), ...(options?.users ?? [])].map((p) => [
        p.id,
        p,
      ]),
    ).values(),
  ];
  return (
    <section className="panel task-editor">
      <div className="panel-heading">
        <h2>{task ? "ແກ້ໄຂວຽກ" : "ສ້າງວຽກໃໝ່"}</h2>
      </div>
      <form onSubmit={submit} className="identity-form" aria-busy={busy}>
        <label>
          ຫົວຂໍ້ວຽກ
          <input
            name="title"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          ລາຍລະອຽດ
          <textarea
            name="description"
            maxLength={8000}
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
          />
        </label>
        <div className="field-grid">
          <label>
            ພະແນກເຈົ້າຂອງ
            <select
              aria-label="ພະແນກເຈົ້າຂອງ"
              name="departmentId"
              required
              value={departmentId}
              onChange={(e) => setDepartment(e.target.value)}
              disabled={!!task || busy || loading}
            >
              <option value="">ເລືອກພະແນກ</option>
              {task ? (
                <option value={task.department.id}>{t(task.department.name)}</option>
              ) : (
                options?.departments.map((d) => (
                  <option value={d.id} key={d.id}>
                    {t(d.name)}
                  </option>
                ))
              )}
            </select>
          </label>
          <label>
            ຄວາມສຳຄັນ
            <select
              aria-label="ຄວາມສຳຄັນ"
              name="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskWrite["priority"])}
              disabled={busy}
            >
              {taskPriorities.map((p) => (
                <option key={p} value={p}>
                  {priorityNames[p]}
                </option>
              ))}
            </select>
          </label>
          <label>
            ວັນຄົບກຳນົດ
            <input
              type="date"
              name="dueDate"
              min="1900-01-01"
              max="9999-12-31"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>
        <label>
          ຄົ້ນຫາຜູ້ໃຊ້
          <input
            type="search"
            placeholder="ພິມຊື່ ຫຼື username ຢ່າງນ້ອຍ 2 ຕົວ"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={busy}
          />
        </label>
        {loading && <Skeleton variant="card" rows={1} label="ກຳລັງຄົ້ນຫາ..." />}
        {optionsError && (
          <p role="alert" className="identity-error">
            {optionsError}
          </p>
        )}
        <label>
          ຜູ້ຮັບຜິດຊອບຫຼັກ
          <select
            aria-label="ຜູ້ຮັບຜິດຊອບຫຼັກ"
            name="assigneeId"
            value={assigneeId}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setAssignee(value);
              setCollaborators((ids) => ids.filter((id) => id !== value));
            }}
            disabled={busy}
            required
          >
            {people.map((p) => (
              <option key={p.id} value={p.id} disabled={p.status === "disabled"}>
                {p.displayName}
                {p.status === "disabled" ? " · ລະງັບແລ້ວ" : ""}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="task-choices">
          <legend>ຜູ້ຮ່ວມວຽກ</legend>
          {displayed
            .filter((p) => p.id !== assigneeId)
            .map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={collaboratorIds.includes(p.id)}
                  disabled={busy || p.status === "disabled"}
                  onChange={(e) => {
                    const checked = e.currentTarget.checked;
                    setCollaborators((ids) =>
                      checked ? [...ids, p.id] : ids.filter((id) => id !== p.id),
                    );
                  }}
                />
                {p.displayName}
              </label>
            ))}
          {!displayed.some((p) => p.id !== assigneeId) && <p>ຄົ້ນຫາຜູ້ໃຊ້ເພື່ອເພີ່ມຜູ້ຮ່ວມວຽກ.</p>}
        </fieldset>
        {canShare && (
          <label className="task-participant-check">
            <input
              type="checkbox"
              checked={share}
              onChange={(e) => setShare(e.target.checked)}
              disabled={busy}
            />
            ແບ່ງປັນສິດເບິ່ງ ແລະ ແກ້ໄຂໃຫ້ຜູ້ຮັບຜິດຊອບ/ຜູ້ຮ່ວມວຽກທີ່ເລືອກ
          </label>
        )}
        <p className="task-help">
          ການເລືອກຄົນບໍ່ໄດ້ປ່ຽນສິດເອງ. ຖ້າບໍ່ແບ່ງປັນເພີ່ມ ຜູ້ທີ່ເລືອກຕ້ອງມີສິດເບິ່ງແລ້ວ. ການເອົາຄົນອອກຈາກວຽກບໍ່ໄດ້ຖອນສິດທີ່ເຄີຍແບ່ງປັນ.
        </p>
        {!task && options && !options.departments.length && (
          <p role="alert">ບັນຊີນີ້ຍັງບໍ່ມີພະແນກສຳລັບສ້າງວຽກ. ກະລຸນາໃຫ້ຜູ້ດູແລກຳນົດສະມາຊິກພະແນກກ່ອນ.</p>
        )}
        {error && (
          <p role="alert" className="identity-error">
            {error}
          </p>
        )}
        {conflict && <p>ວຽກຖືກແກ້ໄຂໂດຍຄົນອື່ນ. ກັບໄປໂຫຼດຂໍ້ມູນຫຼ້າສຸດກ່ອນແກ້ໄຂໃໝ່; ຂໍ້ມູນທີ່ພິມຢູ່ນີ້ຍັງບໍ່ໄດ້ບັນທຶກ.</p>}
        <div className="form-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={onCancel}>
            {conflict ? "ກັບໄປໂຫຼດຂໍ້ມູນໃໝ່" : "ຍົກເລີກ"}
          </button>
          <button
            className="button primary"
            disabled={busy || loading || !departmentId || !!optionsError || conflict}
            type="submit"
          >
            {busy && <Skeleton variant="inline" label="ກຳລັງບັນທຶກ..." />}
            {busy ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກວຽກ"}
          </button>
        </div>
      </form>
    </section>
  );
}
