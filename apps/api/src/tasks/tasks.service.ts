import { enqueueNotification } from "../business/events";
import { syncTaskTeam, taskTeamRecipients, teamInclude } from "./team";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@lapnet/database";
import { DatabaseService } from "../database.service";
import { AuthorizationService, type Transaction } from "../identity/authorization.service";
import {
  CreateTaskInput,
  UpdateTaskInput,
  TransitionInput,
  TaskQuery,
  TaskOptionsQuery,
  HistoryQuery,
  DashboardQuery,
} from "./dto";

const person = { id: true, displayName: true, status: true } as const;
const include = {
  ...teamInclude,
  resource: {
    include: {
      owner: { select: person },
      department: { select: { id: true, code: true, name: true } },
    },
  },
  assignee: { select: person },
  assignedBy: { select: person },
  collaborators: { include: { user: { select: person } }, orderBy: { userId: "asc" as const } },
} satisfies Prisma.TaskInclude;
type Row = Prisma.TaskGetPayload<{ include: typeof include }>;
type Context = Awaited<ReturnType<AuthorizationService["context"]>>;
export function businessDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Vientiane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((x) => x.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function date(value?: string | null) {
  if (value == null) return null;
  const result = new Date(value + "T00:00:00.000Z");
  if (
    !Number.isFinite(result.getTime()) ||
    result.toISOString().slice(0, 10) !== value ||
    value < "1900-01-01" ||
    value > "9999-12-31"
  )
    throw new BadRequestException();
  return result;
}
function encode(row: Row) {
  return Buffer.from(JSON.stringify({ at: row.createdAt.toISOString(), id: row.id })).toString(
    "base64url",
  );
}
function cursor(value?: string) {
  if (!value) return null;
  try {
    const v = JSON.parse(Buffer.from(value, "base64url").toString());
    if (
      typeof v.at !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.at) ||
      !Number.isFinite(Date.parse(v.at)) ||
      typeof v.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.id)
    )
      throw Error();
    return { at: new Date(v.at), id: v.id as string };
  } catch {
    throw new BadRequestException();
  }
}

@Injectable()
export class TasksService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
  ) {}

  private writableDepartments(context: Context) {
    return [
      ...new Set([
        ...context.departments,
        ...context.roles
          .filter((x) => x.role === "resource_editor" && x.departmentId)
          .map((x) => x.departmentId!),
      ]),
    ];
  }
  async options(actor: string, q: TaskOptionsQuery) {
    const context = await this.authorization.context(actor);
    if (q.taskId) await this.authorization.requireResource(actor, q.taskId, "edit");
    const departments = await this.database.client.department.findMany({
      where: { id: { in: this.writableDepartments(context) }, active: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    });
    const term = q.q?.trim() ?? "";
    const users = await this.database.client.user.findMany({
      where: {
        status: "active",
        username: { not: null },
        ...(term.length >= 2
          ? {
              OR: [
                { displayName: { contains: term, mode: "insensitive" as const } },
                { username: { contains: term.toLowerCase(), mode: "insensitive" as const } },
              ],
            }
          : { id: actor }),
      },
      select: person,
      orderBy: { id: "asc" },
      take: Math.min(q.limit, 25),
    });
    const taggableDepartments = await this.database.client.department.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    });
    return { departments, users, taggableDepartments };
  }
  private map(row: Row, editable: Set<string>, manageable: Set<string>, actorId: string) {
    const dueDate = row.dueDate?.toISOString().slice(0, 10) ?? null;
    return {
      id: row.id,
      code: `TSK-${row.number}`,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      dueDate,
      overdue: !!dueDate && dueDate < businessDate() && !["done", "cancelled"].includes(row.status),
      revision: row.revision,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      owner: row.resource.owner,
      department: row.resource.department,
      assignee: row.assignee,
      assignedBy: row.assignedBy,
      collaborators: row.collaborators.map((x) => x.user),
      taggedDepartments: row.taggedDepartments.map((x) => x.department),
      permissions: {
        view: true,
        edit: editable.has(row.id),
        manageAccess: manageable.has(row.id),
        manageTeam: row.resource.ownerUserId === actorId,
      },
    };
  }
  private async mapRows(rows: Row[], context: Context, db: Transaction = this.database.client) {
    const ids = rows.map((x) => x.id);
    const editable = await db.resource.findMany({
      where: { id: { in: ids }, AND: [this.authorization.where(context, "edit")] },
      select: { id: true },
    });
    const manageable = await db.resource.findMany({
      where: { id: { in: ids }, AND: [this.authorization.where(context, "manage_access")] },
      select: { id: true },
    });
    const editIds = new Set(editable.map((x) => x.id)),
      manageIds = new Set(manageable.map((x) => x.id));
    return rows.map((row) => this.map(row, editIds, manageIds, context.userId));
  }
  private mine(context: Context): Prisma.TaskWhereInput {
    return {
      OR: [
        { resource: { ownerUserId: context.userId } },
        { assigneeId: context.userId },
        { collaborators: { some: { userId: context.userId } } },
        { taggedDepartments: { some: { departmentId: { in: context.departments } } } },
      ],
    };
  }
  async list(actor: string, q: TaskQuery) {
    const context = await this.authorization.context(actor),
      after = cursor(q.cursor),
      today = date(businessDate())!;
    const where: Prisma.TaskWhereInput = {
      resource: { AND: [{ kind: "task" }, this.authorization.where(context)] },
      ...(q.status ? { status: q.status } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.departmentId
        ? {
            resource: {
              AND: [
                { kind: "task", ownerDepartmentId: q.departmentId },
                this.authorization.where(context),
              ],
            },
          }
        : {}),
      AND: [
        ...(q.active === "true"
          ? [{ status: { notIn: ["done", "cancelled"] as ("done" | "cancelled")[] } }]
          : []),
        ...(q.q?.trim()
          ? [
              {
                OR: [
                  { title: { contains: q.q.trim(), mode: "insensitive" as const } },
                  { description: { contains: q.q.trim(), mode: "insensitive" as const } },
                  ...(/^TSK-\d{1,10}$/i.test(q.q.trim()) &&
                  Number(q.q.trim().slice(4)) <= 2147483647
                    ? [{ number: Number(q.q.trim().slice(4)) }]
                    : []),
                ],
              },
            ]
          : []),
        ...(q.view === "mine" ? [this.mine(context)] : []),
        ...(q.view === "created" ? [{ resource: { ownerUserId: actor } }] : []),
        ...(q.view === "assigned" ? [{ assignedById: actor }] : []),
        ...(q.view === "team"
          ? [
              {
                OR: [
                  { resource: { ownerDepartmentId: { in: context.departments } } },
                  { taggedDepartments: { some: { departmentId: { in: context.departments } } } },
                ],
              },
            ]
          : []),
        ...(q.due
          ? [
              {
                status: { notIn: ["done", "cancelled"] as ("done" | "cancelled")[] },
                dueDate: q.due === "today" ? today : { lt: today },
              },
            ]
          : []),
      ],
    };
    return this.database.client.$transaction(
      async (tx) => {
        const total = await tx.task.count({ where });
        const rows = await tx.task.findMany({
          where: {
            AND: [
              where,
              ...(after
                ? [
                    {
                      OR: [
                        { createdAt: { lt: after.at } },
                        { createdAt: after.at, id: { lt: after.id } },
                      ],
                    },
                  ]
                : []),
            ],
          },
          include,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: q.limit + 1,
        });
        const items = rows.slice(0, q.limit);
        return {
          items: await this.mapRows(items, context, tx),
          total,
          nextCursor: rows.length > q.limit ? encode(items.at(-1)!) : null,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async dashboard(actor: string, q: DashboardQuery) {
    return this.database.client.$transaction(
      async (tx) => {
        const context = await this.authorization.context(actor, tx);
        const where: Prisma.TaskWhereInput = {
          resource: { AND: [{ kind: "task" }, this.authorization.where(context)] },
          ...(q.view === "mine" ? this.mine(context) : {}),
        };
        const today = businessDate(),
          start = new Date(today + "T00:00:00.000Z");
        start.setUTCDate(start.getUTCDate() - q.days + 1);
        const statuses = await tx.task.groupBy({ by: ["status"], where, _count: { _all: true } });
        const priorities = await tx.task.groupBy({
          by: ["priority"],
          where: { AND: [where, { status: { notIn: ["done", "cancelled"] } }] },
          _count: { _all: true },
        });
        const dueToday = await tx.task.count({
          where: {
            AND: [where, { dueDate: date(today), status: { notIn: ["done", "cancelled"] } }],
          },
        });
        const overdue = await tx.task.count({
          where: {
            AND: [
              where,
              { dueDate: { lt: date(today)! }, status: { notIn: ["done", "cancelled"] } },
            ],
          },
        });
        const upcoming = await tx.task.findMany({
          where: {
            AND: [where, { dueDate: { not: null }, status: { notIn: ["done", "cancelled"] } }],
          },
          include,
          orderBy: [{ dueDate: "asc" }, { id: "asc" }],
          take: 5,
        });
        const recent = await tx.task.findMany({
          where,
          include,
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: 5,
        });
        const days = Array.from({ length: q.days }, (_, i) => {
          const d = new Date(start);
          d.setUTCDate(d.getUTCDate() + i);
          return d.toISOString().slice(0, 10);
        });
        const trend = days.map((day) => ({ date: day, created: 0, completed: 0 }));
        const created = await tx.task.groupBy({
          by: ["createdAt"],
          where: { AND: [where, { createdAt: { gte: new Date(start.getTime() - 7 * 3600000) } }] },
          _count: { _all: true },
        });
        const dayOf = (value: Date) =>
          new Date(value.getTime() + 7 * 3600000).toISOString().slice(0, 10);
        for (const row of created) {
          const bucket = trend.find((x) => x.date === dayOf(row.createdAt));
          if (bucket) bucket.created += row._count._all;
        }
        // A task may be completed, reopened, then completed again. Chart counts completion events.
        const completions = await tx.taskRevision.groupBy({
          by: ["occurredAt"],
          where: {
            task: { is: where },
            action: "transitioned",
            snapshot: { path: ["status"], equals: "done" },
            occurredAt: { gte: new Date(start.getTime() - 7 * 3600000) },
          },
          _count: { _all: true },
        });
        for (const row of completions) {
          const bucket = trend.find((x) => x.date === dayOf(row.occurredAt));
          if (bucket) bucket.completed += row._count._all;
        }
        const count = (status: string) =>
          statuses.find((x) => x.status === status)?._count._all ?? 0;
        return {
          asOf: new Date().toISOString(),
          days: q.days,
          view: q.view,
          totals: {
            total: statuses.reduce((sum, x) => sum + x._count._all, 0),
            active: count("todo") + count("in_progress") + count("blocked"),
            completed: count("done"),
            dueToday,
            overdue,
          },
          statuses: ["todo", "in_progress", "blocked", "done", "cancelled"].map((status) => ({
            status,
            count: count(status),
          })),
          priorities: ["low", "normal", "high", "urgent"].map((priority) => ({
            priority,
            count: priorities.find((x) => x.priority === priority)?._count._all ?? 0,
          })),
          trend,
          upcoming: await this.mapRows(upcoming, context, tx),
          recent: await this.mapRows(recent, context, tx),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async detail(actor: string, id: string) {
    return this.database.client.$transaction(async (tx) => {
      await this.authorization.requireResource(actor, id, "view", tx);
      const row = await tx.task.findUniqueOrThrow({ where: { id }, include });
      const context = await this.authorization.context(actor, tx);
      const [task] = await this.mapRows([row], context, tx);
      const comment = await tx.resource.findFirst({
        where: { id, AND: [this.authorization.where(context, "comment")] },
        select: { id: true },
      });
      return { ...task, permissions: { ...task.permissions, comment: !!comment } };
    });
  }
  private async history(
    tx: Transaction,
    row: Row,
    actor: string,
    action: string,
    requestId: string,
    reason?: string,
  ) {
    const snapshot = {
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null,
      assignee: row.assignee,
      collaborators: row.collaborators.map((x) => x.user),
      taggedDepartments: row.taggedDepartments.map((x) => x.department),
      archived: !!row.resource.archivedAt,
    };
    await tx.taskRevision.create({
      data: { taskId: row.id, revision: row.revision, actorId: actor, action, reason, snapshot },
    });
    await enqueueNotification(
      tx,
      row.id,
      await taskTeamRecipients(tx, row),
      action === "created" || action === "updated" ? "assignment" : "status",
      `task:${row.id}:${row.revision}`,
      actor,
    );
    await this.authorization.audit(tx, actor, `task.${action}`, row.id, requestId, {
      revision: row.revision,
    });
  }
  async create(actor: string, input: CreateTaskInput, requestId: string) {
    const dueDate = date(input.dueDate);
    const id = randomUUID();
    await this.database.client.$transaction(
      async (tx) => {
        const context = await this.authorization.context(actor, tx);
        if (!this.writableDepartments(context).includes(input.departmentId))
          throw new ForbiddenException();
        await tx.resource.create({
          data: { id, kind: "task", ownerUserId: actor, ownerDepartmentId: input.departmentId },
        });
        await syncTaskTeam(tx, actor, id, input);
        const row = await tx.task.create({
          data: {
            id,
            title: input.title,
            description: input.description,
            priority: input.priority,
            dueDate,
            assigneeId: input.assigneeId,
            assignedById: actor,
            collaborators: { create: input.collaboratorIds.map((userId) => ({ userId })) },
            taggedDepartments: {
              create: (input.taggedDepartmentIds ?? []).map((departmentId) => ({ departmentId })),
            },
          },
          include,
        });
        await this.history(tx, row, actor, "created", requestId);
        await this.authorization.audit(tx, actor, "task.participants_shared", id, requestId, {
          userIds: [input.assigneeId, ...input.collaboratorIds],
          departmentIds: input.taggedDepartmentIds ?? [],
        });
      },
      { timeout: 15000 },
    );
    return this.detail(actor, id);
  }
  private async locked(
    tx: Transaction,
    actor: string,
    id: string,
    revision: number,
    permission: "edit" | "manage_access" = "edit",
  ) {
    await tx.$queryRaw`SELECT id FROM resources WHERE id=${id}::uuid FOR UPDATE`;
    await this.authorization.requireResource(actor, id, permission, tx);
    const row = await tx.task.findUniqueOrThrow({ where: { id }, include });
    if (row.revision !== revision) throw new ConflictException();
    return row;
  }
  async update(actor: string, id: string, input: UpdateTaskInput, requestId: string) {
    const dueDate = date(input.dueDate);
    await this.database.client.$transaction(
      async (tx) => {
        const previous = await this.locked(tx, actor, id, input.revision);
        input.taggedDepartmentIds ??= previous.taggedDepartments.map((x) => x.departmentId);
        const same = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();
        const changed =
          previous.assigneeId !== input.assigneeId ||
          !same(
            previous.collaborators.map((x) => x.userId),
            input.collaboratorIds,
          ) ||
          !same(
            previous.taggedDepartments.map((x) => x.departmentId),
            input.taggedDepartmentIds,
          );
        if (previous.resource.ownerUserId !== actor && changed) throw new ForbiddenException();
        if (previous.resource.ownerUserId === actor && changed)
          await syncTaskTeam(tx, actor, id, input);
        await tx.taskTaggedDepartment.deleteMany({ where: { taskId: id } });
        await tx.taskCollaborator.deleteMany({ where: { taskId: id } });
        const row = await tx.task.update({
          where: { id },
          data: {
            title: input.title,
            description: input.description,
            priority: input.priority,
            dueDate,
            assigneeId: input.assigneeId,
            assignedById: previous.assigneeId === input.assigneeId ? previous.assignedById : actor,
            revision: { increment: 1 },
            collaborators: { create: input.collaboratorIds.map((userId) => ({ userId })) },
            taggedDepartments: {
              create: input.taggedDepartmentIds.map((departmentId) => ({ departmentId })),
            },
          },
          include,
        });
        await this.history(tx, row, actor, "updated", requestId);
        if (previous.resource.ownerUserId === actor && changed)
          await this.authorization.audit(tx, actor, "task.participants_shared", id, requestId, {
            userIds: [input.assigneeId, ...input.collaboratorIds],
            departmentIds: input.taggedDepartmentIds ?? [],
          });
      },
      { timeout: 15000 },
    );
    return this.detail(actor, id);
  }
  async inviteFromMentions(
    tx: Transaction,
    actor: string,
    id: string,
    targets: { type: string; id: string }[],
    requestId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM resources WHERE id=${id}::uuid FOR UPDATE`;
    await this.authorization.requireResource(actor, id, "comment", tx);
    const row = await tx.task.findUniqueOrThrow({ where: { id }, include });
    if (row.resource.ownerUserId !== actor) return;
    const users = [
      ...new Set([
        ...row.collaborators.map((x) => x.userId),
        ...targets.filter((x) => x.type === "user" && x.id !== row.assigneeId).map((x) => x.id),
      ]),
    ];
    const departments = [
      ...new Set([
        ...row.taggedDepartments.map((x) => x.departmentId),
        ...targets.filter((x) => x.type === "department").map((x) => x.id),
      ]),
    ];
    if (
      users.length === row.collaborators.length &&
      departments.length === row.taggedDepartments.length
    )
      return;
    await syncTaskTeam(tx, actor, id, {
      assigneeId: row.assigneeId,
      collaboratorIds: users,
      taggedDepartmentIds: departments,
    });
    await tx.taskCollaborator.createMany({
      data: users.map((userId) => ({ taskId: id, userId })),
      skipDuplicates: true,
    });
    await tx.taskTaggedDepartment.createMany({
      data: departments.map((departmentId) => ({ taskId: id, departmentId })),
      skipDuplicates: true,
    });
    const updated = await tx.task.update({
      where: { id },
      data: { revision: { increment: 1 } },
      include,
    });
    await this.history(tx, updated, actor, "team_invited", requestId);
  }
  async transition(actor: string, id: string, input: TransitionInput, requestId: string) {
    await this.database.client.$transaction(async (tx) => {
      const current = await this.locked(tx, actor, id, input.revision);
      const terminal = ["done", "cancelled"].includes(current.status);
      if (
        current.status === input.status ||
        (terminal && input.status !== "todo") ||
        ((terminal || input.status === "cancelled" || input.status === "blocked") &&
          !input.reason?.trim())
      )
        throw new BadRequestException();
      const row = await tx.task.update({
        where: { id },
        data: { status: input.status, revision: { increment: 1 } },
        include,
      });
      await this.history(
        tx,
        row,
        actor,
        terminal ? "reopened" : "transitioned",
        requestId,
        input.reason?.trim(),
      );
    });
    return this.detail(actor, id);
  }
  async archive(actor: string, id: string, revision: number, requestId: string) {
    await this.database.client.$transaction(async (tx) => {
      await this.locked(tx, actor, id, revision, "manage_access");
      await tx.resource.update({ where: { id }, data: { archivedAt: new Date() } });
      const row = await tx.task.update({
        where: { id },
        data: { revision: { increment: 1 } },
        include,
      });
      await this.history(tx, row, actor, "archived", requestId);
    });
    return { archived: true };
  }
  async revisions(actor: string, id: string, q: HistoryQuery) {
    return this.database.client.$transaction(async (tx) => {
      await this.authorization.requireResource(actor, id, "view", tx);
      // Check the business entity too; a generic resource is not a task.
      await tx.task.findUniqueOrThrow({ where: { id }, select: { id: true } });
      const rows = await tx.taskRevision.findMany({
        where: { taskId: id, ...(q.before ? { revision: { lt: q.before } } : {}) },
        include: { actor: { select: person } },
        orderBy: { revision: "desc" },
        take: q.limit + 1,
      });
      const items = rows.slice(0, q.limit);
      return { items, nextBefore: rows.length > q.limit ? items.at(-1)!.revision : null };
    });
  }
}
