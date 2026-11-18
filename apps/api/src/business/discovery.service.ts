import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@lapnet/database";
import { BusinessService, afterCursor, decodeCursor, encodeCursor } from "./business.service";
import { NotificationQuery, RecordQuery } from "./dto";
import { current } from "../identity/authorization.service";

@Injectable()
export class DiscoveryService {
  constructor(private readonly business: BusinessService) {}
  async search(actor: string, q: RecordQuery) {
    const term = q.q?.trim();
    if (!term) return { items: [], total: 0, nextCursor: null };
    return this.business.database.client.$transaction(
      async (tx) => {
        const context = await this.business.authorization.context(actor, tx);
        const match: Prisma.BusinessRecordWhereInput = {
          OR: [
            { title: { contains: term, mode: "insensitive" } },
            { data: { path: ["externalNumber"], string_contains: term } },
            { data: { path: ["registrationNumber"], string_contains: term } },
            { data: { path: ["text"], string_contains: term } },
            { data: { path: ["discussion"], string_contains: term } },
            {
              contacts: {
                some: {
                  OR: [
                    { displayName: { contains: term, mode: "insensitive" } },
                    { email: { contains: term, mode: "insensitive" } },
                    { phone: { contains: term } },
                  ],
                },
              },
            },
          ],
        };
        const code = term.match(/^(?:TSK|REG|CO|INT|POST)-(\d+)$/i);
        const where: Prisma.ResourceWhereInput = {
          AND: [
            ...(q.kind
              ? [{ kind: q.kind as "post" | "company" | "interaction" | "document" | "task" }]
              : []),
            {
              OR: [
                {
                  kind: "task",
                  AND: [this.business.authorization.where(context)],
                  task: {
                    is: {
                      OR: [
                        { title: { contains: term, mode: "insensitive" } },
                        { description: { contains: term, mode: "insensitive" } },
                        ...(code ? [{ number: Number(code[1]) }] : []),
                      ],
                    },
                  },
                },
                {
                  business: {
                    is: {
                      AND: [
                        this.business.where(context),
                        { OR: [match, ...(code ? [{ number: Number(code[1]) }] : [])] },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        };
        const total = await tx.resource.count({ where });
        const rows = await tx.resource.findMany({
          where: { AND: [where, ...afterCursor(decodeCursor(q.cursor))] },
          include: { business: true, task: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: q.limit + 1,
        });
        const prefixes: Record<string, string> = {
          task: "TSK",
          document: "REG",
          company: "CO",
          interaction: "INT",
          post: "POST",
        };
        return {
          total,
          items: rows.slice(0, q.limit).map((row) => ({
            id: row.id,
            kind: row.kind,
            title: row.task?.title ?? row.business?.title ?? "",
            code: `${prefixes[row.kind]}-${row.task?.number ?? row.business?.number}`,
            href: this.business.href(row.kind, row.id),
          })),
          nextCursor: rows.length > q.limit ? encodeCursor(rows[q.limit - 1]) : null,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async notifications(actor: string, q: NotificationQuery) {
    return this.business.database.client.$transaction(
      async (tx) => {
        const context = await this.business.authorization.context(actor, tx);
        const where: Prisma.NotificationWhereInput = {
          recipientId: actor,
          resource: this.business.authorization.where(context),
        };
        const filter: Prisma.NotificationWhereInput =
          q.view === "unread"
            ? { readAt: null }
            : q.view === "mentions"
              ? { kind: "mention" }
              : q.view === "comments"
                ? { kind: "comment" }
                : q.view === "tasks"
                  ? { kind: { in: ["assignment", "status", "due_today", "overdue"] } }
                  : {};
        const unread = await tx.notification.count({ where: { ...where, readAt: null } });
        const total = await tx.notification.count({ where });
        const counts = await tx.notification.groupBy({
          by: ["kind"],
          where,
          _count: { _all: true },
          orderBy: { kind: "asc" },
        });
        const rows = await tx.notification.findMany({
          where: { AND: [where, filter, ...afterCursor(decodeCursor(q.cursor))] },
          include: { resource: { include: { business: true, task: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: q.limit + 1,
        });
        const visible = rows.slice(0, q.limit);
        if (!visible.length)
          return {
            total,
            unread,
            counts: counts.map((row) => ({ kind: row.kind, count: row._count._all })),
            items: [],
            nextCursor: null,
          };
        const jobs = await tx.outboxJob.findMany({
          where: { key: { in: visible.map((row) => row.key) }, recipientId: actor, kind: "notify" },
          select: { key: true, payload: true },
        });
        const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
        const actors = new Map<string, string>();
        for (const job of jobs) {
          const value = (job.payload as Prisma.JsonObject)?.actorId;
          if (typeof value === "string" && uuid.test(value)) actors.set(job.key, value);
        }
        // Resolve current authorized content, never a private text snapshot in the outbox.
        const source = (key: string) => {
          const id = key.match(/^(?:comment|mention):([a-f0-9-]{36}):/i)?.[1];
          return id && uuid.test(id) ? id : undefined;
        };
        const sources = visible.flatMap((row) => {
          const id = source(row.key);
          return id ? [id] : [];
        });
        const comments = await tx.resourceComment.findMany({
          where: {
            id: { in: sources },
            resourceId: { in: visible.map((row) => row.resourceId) },
            archivedAt: null,
          },
          select: { id: true, resourceId: true, text: true, authorId: true },
        });
        const revisions = visible.flatMap((row) => {
          const match = row.key.match(/^task:([a-f0-9-]{36}):(\d+):/i);
          return match &&
            match[1] === row.resourceId &&
            Number(match[2]) >= 1 &&
            Number(match[2]) <= 2147483647
            ? [{ taskId: row.resourceId, revision: Number(match[2]) }]
            : [];
        });
        const taskEvents = revisions.length
          ? await tx.taskRevision.findMany({
              where: { OR: revisions },
              select: { taskId: true, revision: true, actorId: true },
            })
          : [];
        for (const row of visible) {
          if (actors.has(row.key)) continue;
          const comment = comments.find(
            (item) => item.id === source(row.key) && item.resourceId === row.resourceId,
          );
          const event = taskEvents.find((item) =>
            row.key.startsWith(`task:${item.taskId}:${item.revision}:`),
          );
          const actorId = comment?.authorId ?? event?.actorId;
          if (actorId) actors.set(row.key, actorId);
        }
        const users = await tx.user.findMany({
          where: { id: { in: [...new Set(actors.values())] } },
          select: {
            id: true,
            displayName: true,
            memberships: {
              where: { ...current(), department: { active: true } },
              select: { department: { select: { name: true } } },
              orderBy: { department: { code: "asc" } },
            },
          },
        });
        const prefixes: Record<string, string> = {
          task: "TSK",
          document: "REG",
          company: "CO",
          interaction: "INT",
          post: "POST",
        };
        return {
          total,
          unread,
          counts: counts.map((row) => ({ kind: row.kind, count: row._count._all })),
          items: visible.map((row) => {
            const user = users.find((user) => user.id === actors.get(row.key));
            const comment = comments.find(
              (item) => item.id === source(row.key) && item.resourceId === row.resourceId,
            );
            return {
              id: row.id,
              kind: row.kind,
              title: row.resource.business?.title ?? row.resource.task?.title ?? "",
              href: this.business.href(row.resource.kind, row.resourceId),
              readAt: row.readAt?.toISOString() ?? null,
              createdAt: row.createdAt.toISOString(),
              resourceKind: row.resource.kind,
              code: `${prefixes[row.resource.kind]}-${row.resource.task?.number ?? row.resource.business?.number ?? ""}`,
              actor: user
                ? {
                    id: user.id,
                    displayName: user.displayName,
                    department:
                      user.memberships.map((item) => item.department.name).join(" · ") || null,
                  }
                : null,
              excerpt: comment?.text.slice(0, 240) ?? null,
            };
          }),
          nextCursor: rows.length > q.limit ? encodeCursor(rows[q.limit - 1]) : null,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async readAll(actor: string) {
    return this.business.database.client.$transaction(async (tx) => {
      const context = await this.business.authorization.context(actor, tx);
      const now = new Date();
      const result = await tx.notification.updateMany({
        where: {
          recipientId: actor,
          readAt: null,
          createdAt: { lte: now },
          resource: this.business.authorization.where(context),
        },
        data: { readAt: now },
      });
      return { read: true, count: result.count };
    });
  }
  async read(actor: string, id: string) {
    const context = await this.business.authorization.context(actor);
    const result = await this.business.database.client.notification.updateMany({
      where: { id, recipientId: actor, resource: this.business.authorization.where(context) },
      data: { readAt: new Date() },
    });
    if (!result.count) throw new NotFoundException();
    return { read: true };
  }
  async jobs(actor: string) {
    await this.business.authorization.requireAdmin(actor);
    const counts = await this.business.database.client.outboxJob.groupBy({
      by: ["kind", "status"],
      _count: { _all: true },
    });
    const failed = await this.business.database.client.outboxJob.findMany({
      where: { status: "failed" },
      select: { id: true, kind: true, attempts: true, errorCode: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    return { counts, failed };
  }
  async retry(actor: string, id: string) {
    await this.business.authorization.requireAdmin(actor);
    const result = await this.business.database.client.outboxJob.updateMany({
      where: { id, status: "failed" },
      data: { status: "pending", attempts: 0, availableAt: new Date(), errorCode: null },
    });
    if (!result.count) throw new NotFoundException();
    return { queued: true };
  }
}
