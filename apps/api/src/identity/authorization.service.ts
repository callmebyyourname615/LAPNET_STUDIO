import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { DatabaseService } from "../database.service";
import type { Prisma } from "@lapnet/database";
import { Buffer } from "node:buffer";

export type Permission = "view" | "comment" | "edit" | "download" | "manage_access";
export const permissions: Permission[] = ["view", "comment", "edit", "download", "manage_access"];
export type Transaction = Prisma.TransactionClient;
export const current = (now = new Date()) => ({
  effectiveFrom: { lte: now },
  OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
});
export function pageCursor(cursor?: string) {
  if (!cursor) return undefined;
  const value = Buffer.from(cursor, "base64url").toString("utf8");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    throw new BadRequestException();
  return value;
}
export const nextCursor = (id: string) => Buffer.from(id).toString("base64url");
export const userSummary = {
  id: true,
  username: true,
  displayName: true,
  email: true,
  status: true,
  mustChangePassword: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthorizationService {
  constructor(private readonly database: DatabaseService) {}
  async context(userId: string, db: Transaction = this.database.client) {
    const user = await db.user.findFirst({
      where: { id: userId, status: "active" },
      select: {
        id: true,
        memberships: {
          where: { ...current(), department: { active: true } },
          select: { departmentId: true },
        },
        roles: {
          where: current(),
          select: { role: true, departmentId: true, department: { select: { active: true } } },
        },
      },
    });
    if (!user) throw new UnauthorizedException();
    return {
      userId: user.id,
      departments: user.memberships.map((x) => x.departmentId),
      roles: user.roles.filter((x) => !x.department || x.department.active),
      admin: user.roles.some((x) => x.role === "portal_admin" && x.departmentId === null),
    };
  }
  async requireAdmin(userId: string, db: Transaction = this.database.client) {
    if (!(await this.context(userId, db)).admin) throw new ForbiddenException();
  }
  where(
    context: Awaited<ReturnType<AuthorizationService["context"]>>,
    permission: Permission = "view",
  ): Prisma.ResourceWhereInput {
    const subjects: Prisma.ResourceGrantWhereInput[] = [
      { userId: context.userId },
      { departmentId: { in: context.departments } },
    ];
    const scope = context.roles
      .filter(
        (x) =>
          x.departmentId &&
          (permission === "view" ||
            (x.role === "resource_editor" && ["edit", "comment"].includes(permission))),
      )
      .map((x) => x.departmentId!);
    const action: Prisma.ResourceWhereInput = {
      OR: [
        { ownerUserId: context.userId },
        { ownerDepartmentId: { in: scope } },
        { grants: { some: { revokedAt: null, permission, OR: subjects } } },
      ],
    };
    return {
      archivedAt: null,
      AND: permission === "view" ? [action] : [this.where(context), action],
    };
  }
  async requireResource(
    userId: string,
    id: string,
    permission: Permission = "view",
    db: Transaction = this.database.client,
  ) {
    const context = await this.context(userId, db);
    const resource = await db.resource.findFirst({ where: { id, AND: [this.where(context)] } });
    if (!resource) throw new NotFoundException();
    if (
      permission !== "view" &&
      !(await db.resource.findFirst({
        where: { id, AND: [this.where(context, permission)] },
        select: { id: true },
      }))
    )
      throw new ForbiddenException();
    if (permission === "download" && resource.kind !== "document") throw new ForbiddenException();
    return resource;
  }
  async audit(
    db: Transaction,
    actorId: string | null,
    action: string,
    targetId: string | null,
    requestId: string | null,
    metadata: Prisma.InputJsonObject = {},
  ) {
    await db.auditEvent.create({ data: { actorId, action, targetId, requestId, metadata } });
  }
}
