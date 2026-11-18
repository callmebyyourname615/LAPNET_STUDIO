import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@lapnet/database";
import { BusinessService, afterCursor, decodeCursor, encodeCursor } from "./business.service";
import { RecordQuery } from "./dto";

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
  async notifications(actor: string, q: RecordQuery) {
    return this.business.database.client.$transaction(
      async (tx) => {
        const context = await this.business.authorization.context(actor, tx);
        const where: Prisma.NotificationWhereInput = {
          recipientId: actor,
          resource: this.business.authorization.where(context),
        };
        const unread = await tx.notification.count({ where: { ...where, readAt: null } });
        const rows = await tx.notification.findMany({
          where: { AND: [where, ...afterCursor(decodeCursor(q.cursor))] },
          include: { resource: { include: { business: true, task: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: q.limit + 1,
        });
        return {
          unread,
          items: rows.slice(0, q.limit).map((row) => ({
            id: row.id,
            kind: row.kind,
            title: row.resource.business?.title ?? row.resource.task?.title ?? "",
            href: this.business.href(row.resource.kind, row.resourceId),
            readAt: row.readAt?.toISOString() ?? null,
            createdAt: row.createdAt.toISOString(),
          })),
          nextCursor: rows.length > q.limit ? encodeCursor(rows[q.limit - 1]) : null,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
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
