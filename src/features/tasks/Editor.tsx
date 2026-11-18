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
import { useTaskData } from "./api";
import { TaskAssignmentPicker } from "./TaskAssignmentPicker";

type Person = TaskOptions["users"][number];
export function TaskEditor({
  task,
  onSaved,
  onCancel,
  sourceInteractionId,
}: {
  task?: TaskRecord;
  sourceInteractionId?: string;
  onSaved: (task: TaskRecord) => void;
  onCancel: () => void;
}) {
  const { me } = useAuth();
  const self: Person = {
    id: me!.user.id,
    displayName: me!.user.displayName,
    status: "active",
    username: me!.user.username,
    departments: me!.memberships.map(({ department }) => department),
  };
  const [title, setTitle] = useState(task?.title ?? ""),
    [description, setDescription] = useState(task?.description ?? ""),
    [priority, setPriority] = useState<TaskWrite["priority"]>(task?.priority ?? "normal"),
    [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [departmentId, setDepartment] = useState(
    task?.department.id ?? me?.memberships[0]?.department.id ?? "",
  );
  const [assigneeId, setAssignee] = useState(task?.assignee.id ?? self.id),
    [collaboratorIds, setCollaborators] = useState(task?.collaborators.map((p) => p.id) ?? []);
  const [taggedDepartmentIds, setTaggedDepartments] = useState(
    task?.taggedDepartments.map((d) => d.id) ?? [],
  );
  const {
    data: options,
    error: optionsError,
    loading,
    reload,
  } = useTaskData(
    "/api/v1/tasks/options?limit=25" + (task ? "&taskId=" + task.id : ""),
    taskOptionsSchema,
  );
  const [people, setPeople] = useState<Person[]>([
    ...new Map(
      [
        self,
        ...(task
          ? [task.assignee, ...task.collaborators].map((person) => ({
              ...person,
              username: null,
              departments: [],
            }))
          : []),
      ].map((person) => [person.id, person]),
    ).values(),
  ]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false);
  const canShare = !task || task.permissions.manageTeam;
  useEffect(() => {
    if (options) setDepartment((old) => old || options.departments[0]?.id || "");
  }, [options]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || conflict) return;
    setError("");
    setBusy(true);
    const fields: TaskWrite = {
      title: title.trim(),
      description,
      priority,
      dueDate: dueDate || null,
      assigneeId,
      collaboratorIds,
      taggedDepartmentIds,
    };
    try {
      const value = await apiRequest(
        task
          ? "/api/v1/tasks/" + task.id
          : sourceInteractionId
            ? `/api/v1/interactions/${sourceInteractionId}/follow-up-tasks`
            : "/api/v1/tasks",
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
  return (
    <section className="panel task-editor">
      <div className="panel-heading">
        <h2>{task ? "ແກ້ໄຂວຽກ" : "ສ້າງວຽກໃໝ່"}</h2>
        <p className="task-help">
          Host: {task?.owner.displayName ?? self.displayName} · ເລືອກຄົນ ຫຼື ພະແນກເຂົ້າທີມ
          ແລ້ວຮ່ວມອັບເດດໃນວຽກນີ້ໄດ້ເລີຍ.
        </p>
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
        {optionsError && (
          <div className="identity-error" role="alert">
            <p>{optionsError}</p>
            <button type="button" className="button secondary" onClick={reload}>
              ລອງໃໝ່
            </button>
          </div>
        )}
        <TaskAssignmentPicker
          value={{ assigneeId, collaboratorIds, taggedDepartmentIds }}
          people={[
            ...new Map(
              [...people, ...(options?.users ?? [])].map((person) => [person.id, person]),
            ).values(),
          ]}
          departments={[
            ...new Map(
              [...(task?.taggedDepartments ?? []), ...(options?.taggableDepartments ?? [])].map(
                (department) => [department.id, department],
              ),
            ).values(),
          ]}
          taskId={task?.id}
          disabled={busy || !canShare || !options}
          onChange={(next, known) => {
            setAssignee(next.assigneeId);
            setCollaborators(next.collaboratorIds);
            setTaggedDepartments(next.taggedDepartmentIds);
            setPeople(known);
          }}
        />
        <p className="task-help">
          {canShare
            ? "ຄົນ ແລະ ສະມາຊິກພະແນກທີ່ເລືອກຈະເບິ່ງ, ປ່ຽນສະຖານະ ແລະ ຂຽນຄວາມຄືບໜ້າໄດ້ອັດຕະໂນມັດ. Host ເປັນຜູ້ຈັດການທີມ."
            : "Host ເປັນຜູ້ຈັດການຜູ້ຮັບຜິດຊອບ ແລະ ທີມ. ທ່ານອັບເດດລາຍລະອຽດ ແລະ ສະຖານະວຽກໄດ້."}
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
