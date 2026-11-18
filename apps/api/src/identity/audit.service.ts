import { BadRequestException, HttpException, Injectable } from "@nestjs/common";
import { z } from "zod";
import type { Prisma } from "@lapnet/database";
import { DatabaseService } from "../database.service";
import type { PortalRequest } from "../http";
import { AuthorizationService } from "./authorization.service";

const cursorSchema = z.object({ at: z.iso.datetime(), id: z.uuid() }).strict();
const querySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().max(200).optional(),
    q: z.string().trim().max(100).optional(),
    actor: z.string().trim().max(100).optional(),
    category: z
      .enum([
        "auth",
        "account",
        "task",
        "document",
        "organization",
        "resource",
        "activity",
        "company",
        "post",
        "interaction",
      ])
      .optional(),
    outcome: z.enum(["success", "failure"]).optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
const organizationActions = ["user", "department", "membership", "position", "role"];
const safeMetadataKeys = new Set([
  "revision",
  "grantId",
  "permission",
  "userId",
  "departmentId",
  "bytes",
  "versionId",
  "fields",
  "kind",
  "role",
  "ownerUserId",
  "ownerDepartmentId",
  "participantCount",
  "count",
  "folderId",
  "parentId",
  "method",
  "path",
  "status",
  "durationMs",
  "search",
  "attemptedUsername",
]);
export function auditStatus(error: unknown) {
  if (error instanceof HttpException) return error.getStatus();
  const code = error && typeof error === "object" && "code" in error ? error.code : "";
  return code === "P2025" ? 404 : ["P2002", "P2003", "P2034"].includes(String(code)) ? 409 : 500;
}
export function safeAuditMetadata(value: Prisma.JsonValue) {
  const result: Record<string, string | number | boolean | string[]> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, item] of Object.entries(value)) {
    if (!safeMetadataKeys.has(key)) continue;
    if (typeof item === "number" || typeof item === "boolean") result[key] = item;
    else if (typeof item === "string") result[key] = item.slice(0, 200);
    else if (Array.isArray(item))
      result[key] = item
        .filter((x): x is string => typeof x === "string")
        .slice(0, 25)
        .map((x) => x.slice(0, 100));
  }
  return result;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(actorId: string, input: unknown) {
    await this.authorization.requireAdmin(actorId);
    const parsed = querySchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException();
    const q = parsed.data;
    if (q.from && q.to && new Date(q.from) >= new Date(q.to)) throw new BadRequestException();
    let cursor: z.infer<typeof cursorSchema> | undefined;
    if (q.cursor) {
      try {
        cursor = cursorSchema.parse(JSON.parse(Buffer.from(q.cursor, "base64url").toString()));
      } catch {
        throw new BadRequestException();
      }
    }
    const uuid = (value: string) => z.uuid().safeParse(value).success;
    const filters: Prisma.AuditEventWhereInput[] = [];
    if (q.actor)
      filters.push({
        OR: [
          ...(uuid(q.actor) ? [{ actorId: q.actor }] : []),
          { metadata: { path: ["attemptedUsername"], string_contains: q.actor.toLowerCase() } },
          {
            actor: {
              is: {
                OR: [
                  { username: { contains: q.actor, mode: "insensitive" } },
                  { displayName: { contains: q.actor, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      });
    if (q.q)
      filters.push({
        OR: [
          { action: { contains: q.q, mode: "insensitive" } },
          ...(uuid(q.q) ? [{ targetId: q.q }, { requestId: q.q }, { id: q.q }] : []),
        ],
      });
    if (q.category)
      filters.push(
        q.category === "organization"
          ? { OR: organizationActions.map((action) => ({ action: { startsWith: action + "." } })) }
          : { action: { startsWith: q.category + "." } },
      );
    if (q.outcome) filters.push({ outcome: q.outcome });
    if (q.from || q.to)
      filters.push({
        occurredAt: {
          ...(q.from ? { gte: new Date(q.from) } : {}),
          ...(q.to ? { lt: new Date(q.to) } : {}),
        },
      });
    const where: Prisma.AuditEventWhereInput = { AND: filters };
    const pageWhere: Prisma.AuditEventWhereInput = cursor
      ? {
          AND: [
            where,
            {
              OR: [
                { occurredAt: { lt: new Date(cursor.at) } },
                { occurredAt: new Date(cursor.at), id: { lt: cursor.id } },
              ],
            },
          ],
        }
      : where;
    const [rows, total] = await this.database.client.$transaction(
      [
        this.database.client.auditEvent.findMany({
          where: pageWhere,
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          take: q.limit + 1,
          include: { actor: { select: { id: true, username: true, displayName: true } } },
        }),
        this.database.client.auditEvent.count({ where }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
    const items = rows
      .slice(0, q.limit)
      .map((row) => ({ ...row, metadata: safeAuditMetadata(row.metadata) }));
    const last = items.at(-1);
    return {
      items,
      total,
      nextCursor:
        rows.length > q.limit && last
          ? Buffer.from(
              JSON.stringify({ at: last.occurredAt.toISOString(), id: last.id }),
            ).toString("base64url")
          : null,
    };
  }

  async request(request: PortalRequest, status: number, durationMs = 0) {
    if (!request.principal) return;
    const route = request.route?.path as unknown;
    if (typeof route !== "string" || route.length > 200 || !/^\/[A-Za-z0-9_:/.*()-]+$/.test(route))
      return;
    // Session refresh and image fetches are background plumbing, not user actions.
    if (
      status < 400 &&
      (route === "/api/v1/activity/page-view" ||
        (request.method === "GET" && ["/api/v1/me", "/api/v1/me/images/:kind"].includes(route)))
    )
      return;
    const id = request.params.id;
    await this.authorization.audit(
      this.database.client,
      request.principal.user.id,
      "activity.request",
      typeof id === "string" && z.uuid().safeParse(id).success ? id : null,
      request.requestId,
      {
        method: request.method,
        path: route,
        status,
        durationMs: Math.max(0, Math.round(durationMs)),
        search: typeof request.query.q === "string" && !!request.query.q,
      },
    );
  }

  async page(request: PortalRequest, input: unknown) {
    const parsed = z
      .object({ path: z.string().max(200) })
      .strict()
      .safeParse(input);
    if (!parsed.success) throw new BadRequestException();
    const path = parsed.data.path;
    const portal = path.replace(/^\/document-workspace\/portal(?=\/)/, "");
    const valid =
      /^\/(dashboard|settings|account|search|notifications|admin\/(people|departments|access|audit))$/.test(
        portal,
      ) ||
      /^\/(tasks|documents|companies|feed|interactions)(\/(new|[0-9a-f-]{36}))?(\/interactions\/new)?$/i.test(
        portal,
      ) ||
      /^\/document-workspace(\/(folders\/)?[0-9a-f-]{36}|\/related\/(company|task|post)(\/[0-9a-f-]{36})?)?$/i.test(
        path,
      );
    if (!valid) throw new BadRequestException();
    await this.authorization.audit(
      this.database.client,
      request.principal!.user.id,
      "activity.page_viewed",
      null,
      request.requestId,
      { path },
    );
    return { ok: true };
  }
}
