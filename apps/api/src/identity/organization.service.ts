import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { DatabaseService } from "../database.service";
import {
  AuthorizationService,
  current,
  userSummary,
  pageCursor,
  nextCursor,
  type Transaction,
} from "./authorization.service";
import { hashPassword, randomSecret } from "./password";
import {
  UserCreateInput,
  UserUpdateInput,
  DepartmentInput,
  DepartmentUpdateInput,
  MembershipInput,
  PositionAssignmentInput,
  RoleInput,
  type DirectoryQuery,
} from "./dto";

function dates(input: { effectiveFrom?: string; effectiveTo?: string }) {
  const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
  const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
  if (effectiveTo && effectiveTo <= effectiveFrom) throw new BadRequestException();
  return { effectiveFrom, effectiveTo };
}

@Injectable()
export class OrganizationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
  ) {}
  private async action<T>(actor: string, work: (tx: Transaction) => Promise<T>) {
    return this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(27681,2)`;
      await this.authorization.requireAdmin(actor, tx);
      return work(tx);
    });
  }
  private async otherAdmin(tx: Transaction, userId?: string, roleId?: string) {
    const count = await tx.roleAssignment.count({
      where: {
        role: "portal_admin",
        ...current(),
        effectiveTo: null,
        user: { status: "active" },
        ...(userId ? { userId: { not: userId } } : {}),
        ...(roleId ? { id: { not: roleId } } : {}),
      },
    });
    if (!count) throw new ConflictException();
  }
  async listUsers(actor: string, query: DirectoryQuery) {
    await this.authorization.requireAdmin(actor);
    const id = pageCursor(query.cursor);
    const where = {
      ...(id ? { id: { gt: id } } : {}),
      ...(query.q
        ? {
            OR: [
              { username: { contains: query.q, mode: "insensitive" as const } },
              { displayName: { contains: query.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const rows = await this.database.client.user.findMany({
      where,
      take: query.limit + 1,
      orderBy: { id: "asc" },
      select: {
        ...userSummary,
        memberships: {
          where: { ...current(), user: { status: "active" } },
          select: {
            id: true,
            department: { select: { id: true, name: true, code: true } },
            membershipRole: true,
          },
        },
        roles: { where: current(), select: { id: true, role: true, departmentId: true } },
      },
    });
    const items = rows.slice(0, query.limit);
    return { items, nextCursor: rows.length > query.limit ? nextCursor(items.at(-1)!.id) : null };
  }
  async createUser(actor: string, input: UserCreateInput, requestId: string) {
    await this.authorization.requireAdmin(actor);
    const temporaryPassword = randomSecret().slice(0, 24);
    const passwordHash = await hashPassword(temporaryPassword);
    const user = await this.action(actor, async (tx) => {
      const user = await tx.user.create({
        data: {
          identitySubject: "local:" + randomSecret(),
          username: input.username,
          displayName: input.displayName.trim(),
          email: input.email,
          passwordHash,
          mustChangePassword: false,
        },
        select: userSummary,
      });
      await this.authorization.audit(tx, actor, "user.created", user.id, requestId, {
        username: input.username,
      });
      return user;
    });
    return { user, temporaryPassword };
  }
  async updateUser(actor: string, id: string, input: UserUpdateInput, requestId: string) {
    return this.action(actor, async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new NotFoundException();
      if (
        input.status === "disabled" &&
        user.status === "active" &&
        (await tx.roleAssignment.findFirst({
          where: { userId: id, role: "portal_admin", ...current() },
        }))
      )
        await this.otherAdmin(tx, id);
      const result = await tx.user.update({
        where: { id },
        data: {
          ...(input.displayName ? { displayName: input.displayName.trim() } : {}),
          ...(input.status ? { status: input.status, credentialVersion: { increment: 1 } } : {}),
        },
        select: userSummary,
      });
      if (input.status)
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await this.authorization.audit(tx, actor, "user.updated", id, requestId, {
        status: result.status,
      });
      return result;
    });
  }
  async resetPassword(actor: string, id: string, requestId: string) {
    await this.authorization.requireAdmin(actor);
    const temporaryPassword = randomSecret().slice(0, 24);
    const passwordHash = await hashPassword(temporaryPassword);
    await this.action(actor, async (tx) => {
      if (!(await tx.user.findUnique({ where: { id }, select: { id: true } })))
        throw new NotFoundException();
      await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: false, credentialVersion: { increment: 1 } },
      });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.authorization.audit(tx, actor, "user.password_reset", id, requestId);
    });
    return { temporaryPassword };
  }
  async organization(actor: string) {
    const context = await this.authorization.context(actor);
    const departments = await this.database.client.department.findMany({
      where: context.admin ? {} : { active: true },
      orderBy: { code: "asc" },
    });
    const positions = await this.database.client.position.findMany({
      orderBy: { code: "asc" },
      include: {
        assignments: {
          where: current(),
          select: {
            id: true,
            user: { select: { id: true, displayName: true, status: true } },
            effectiveFrom: true,
            effectiveTo: true,
          },
        },
      },
    });
    const reporting = await this.database.client.reportingLine.findMany({
      where: { ...current(), ...(context.admin ? {} : { department: { active: true } }) },
      select: { id: true, departmentId: true, positionId: true },
    });
    const collaborations = await this.database.client.collaborationLink.findMany({
      where: context.admin ? {} : { departmentA: { active: true }, departmentB: { active: true } },
      select: { id: true, departmentAId: true, departmentBId: true },
    });
    return { departments, positions, reporting, collaborations };
  }
  async createDepartment(actor: string, input: DepartmentInput, requestId: string) {
    return this.action(actor, async (tx) => {
      const row = await tx.department.create({ data: input });
      await this.authorization.audit(tx, actor, "department.created", row.id, requestId, {
        code: row.code,
      });
      return row;
    });
  }
  async updateDepartment(
    actor: string,
    id: string,
    input: DepartmentUpdateInput,
    requestId: string,
  ) {
    return this.action(actor, async (tx) => {
      const row = await tx.department.update({ where: { id }, data: input });
      await this.authorization.audit(tx, actor, "department.updated", row.id, requestId, {
        active: row.active,
      });
      return row;
    });
  }
  async membership(actor: string, input: MembershipInput, requestId: string) {
    return this.action(actor, async (tx) => {
      if (
        !(await tx.user.findFirst({ where: { id: input.userId, status: "active" } })) ||
        !(await tx.department.findFirst({ where: { id: input.departmentId, active: true } }))
      )
        throw new BadRequestException();
      const range = dates(input);
      if (
        await tx.departmentMembership.findFirst({
          where: {
            userId: input.userId,
            departmentId: input.departmentId,
            ...(range.effectiveTo ? { effectiveFrom: { lt: range.effectiveTo } } : {}),
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: range.effectiveFrom } }],
          },
        })
      )
        throw new ConflictException();
      const row = await tx.departmentMembership.create({ data: { ...input, ...range } });
      await this.authorization.audit(tx, actor, "membership.created", row.id, requestId, {
        userId: row.userId,
        departmentId: row.departmentId,
      });
      return row;
    });
  }
  async endMembership(actor: string, id: string, requestId: string) {
    return this.action(actor, async (tx) => {
      const row = await tx.departmentMembership.findUnique({ where: { id } });
      if (!row || row.effectiveTo) throw new NotFoundException();
      const updated = await tx.departmentMembership.update({
        where: { id },
        data: { effectiveTo: new Date(Math.max(Date.now(), row.effectiveFrom.getTime())) },
      });
      await this.authorization.audit(tx, actor, "membership.ended", id, requestId, {
        userId: row.userId,
      });
      return updated;
    });
  }
  async assignPosition(actor: string, input: PositionAssignmentInput, requestId: string) {
    return this.action(actor, async (tx) => {
      if (!(await tx.user.findFirst({ where: { id: input.userId, status: "active" } })))
        throw new BadRequestException();
      const position = await tx.position.findUnique({ where: { id: input.positionId } });
      if (!position) throw new BadRequestException();
      const range = dates(input);
      if (
        await tx.positionAssignment.findFirst({
          where: {
            positionId: input.positionId,
            ...(position.code === "BOARD" ? { userId: input.userId } : {}),
            ...(range.effectiveTo ? { effectiveFrom: { lt: range.effectiveTo } } : {}),
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: range.effectiveFrom } }],
          },
        })
      )
        throw new ConflictException();
      const row = await tx.positionAssignment.create({ data: { ...input, ...range } });
      await this.authorization.audit(tx, actor, "position.assigned", row.id, requestId, {
        userId: row.userId,
        positionId: row.positionId,
      });
      return row;
    });
  }
  async endPosition(actor: string, id: string, requestId: string) {
    return this.action(actor, async (tx) => {
      const row = await tx.positionAssignment.findUnique({ where: { id } });
      if (!row || row.effectiveTo) throw new NotFoundException();
      const updated = await tx.positionAssignment.update({
        where: { id },
        data: { effectiveTo: new Date(Math.max(Date.now(), row.effectiveFrom.getTime())) },
      });
      await this.authorization.audit(tx, actor, "position.ended", id, requestId, {
        userId: row.userId,
      });
      return updated;
    });
  }
  async roles(actor: string) {
    await this.authorization.requireAdmin(actor);
    return this.database.client.roleAssignment.findMany({
      where: current(),
      orderBy: { id: "asc" },
      take: 100,
      select: {
        id: true,
        userId: true,
        role: true,
        departmentId: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    });
  }
  async assignRole(actor: string, input: RoleInput, requestId: string) {
    if ((input.role === "portal_admin") !== !input.departmentId) throw new BadRequestException();
    return this.action(actor, async (tx) => {
      if (!(await tx.user.findFirst({ where: { id: input.userId, status: "active" } })))
        throw new BadRequestException();
      if (
        input.departmentId &&
        !(await tx.department.findFirst({ where: { id: input.departmentId, active: true } }))
      )
        throw new BadRequestException();
      const row = await tx.roleAssignment.create({
        data: { ...input, ...dates(input), grantedById: actor },
      });
      await this.authorization.audit(tx, actor, "role.assigned", row.id, requestId, {
        userId: row.userId,
        role: row.role,
        departmentId: row.departmentId,
      });
      return row;
    });
  }
  async revokeRole(actor: string, id: string, requestId: string) {
    return this.action(actor, async (tx) => {
      const row = await tx.roleAssignment.findUnique({ where: { id } });
      if (!row || row.effectiveTo) throw new NotFoundException();
      if (row.role === "portal_admin") await this.otherAdmin(tx, undefined, id);
      const result = await tx.roleAssignment.update({
        where: { id },
        data: { effectiveTo: new Date(Math.max(Date.now(), row.effectiveFrom.getTime())) },
      });
      await this.authorization.audit(tx, actor, "role.revoked", id, requestId, {
        userId: row.userId,
      });
      return result;
    });
  }
  async audit(actor: string, query: DirectoryQuery) {
    await this.authorization.requireAdmin(actor);
    const cursor = pageCursor(query.cursor);
    const rows = await this.database.client.auditEvent.findMany({
      where: cursor ? { id: { gt: cursor } } : {},
      orderBy: { id: "asc" },
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit);
    return { items, nextCursor: rows.length > query.limit ? nextCursor(items.at(-1)!.id) : null };
  }
}
