import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database.service";
import {
  AuthorizationService,
  pageCursor,
  nextCursor,
  type Transaction,
} from "./authorization.service";
import { DirectoryQuery, GrantInput } from "./dto";

@Injectable()
export class ResourcesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
  ) {}
  async list(actor: string, query: DirectoryQuery) {
    const context = await this.authorization.context(actor);
    const cursor = pageCursor(query.cursor);
    const where = this.authorization.where(context);
    const [rows, total] = await this.database.client.$transaction([
      this.database.client.resource.findMany({
        where: { AND: [where, ...(cursor ? [{ id: { gt: cursor } }] : [])] },
        orderBy: { id: "asc" },
        take: query.limit + 1,
      }),
      this.database.client.resource.count({ where }),
    ]);
    const items = rows.slice(0, query.limit);
    return {
      items,
      total,
      nextCursor: rows.length > query.limit ? nextCursor(items.at(-1)!.id) : null,
    };
  }
  async detail(actor: string, id: string) {
    const row = await this.authorization.requireResource(actor, id);
    const context = await this.authorization.context(actor);
    const [comment, edit, download, manage_access] = await Promise.all(
      (["comment", "edit", "download", "manage_access"] as const).map((permission) =>
        this.database.client.resource.count({
          where: { id, AND: [this.authorization.where(context, permission)] },
        }),
      ),
    );
    return {
      ...row,
      permissions: {
        view: true,
        comment: !!comment,
        edit: !!edit,
        download: row.kind === "document" && !!download,
        manage_access: !!manage_access,
      },
    };
  }
  async grants(actor: string, id: string) {
    await this.authorization.requireResource(actor, id, "manage_access");
    return this.database.client.resourceGrant.findMany({
      where: { resourceId: id, revokedAt: null },
      orderBy: { id: "asc" },
      take: 100,
      select: {
        id: true,
        userId: true,
        departmentId: true,
        permission: true,
        grantedById: true,
        createdAt: true,
        user: { select: { displayName: true } },
        department: { select: { name: true } },
      },
    });
  }
  async targets(actor: string, id: string, query: DirectoryQuery) {
    await this.authorization.requireResource(actor, id, "manage_access");
    return this.database.client.user.findMany({
      where: {
        status: "active",
        ...(query.q ? { displayName: { contains: query.q, mode: "insensitive" as const } } : {}),
      },
      orderBy: { id: "asc" },
      take: Math.min(query.limit, 25),
      select: { id: true, displayName: true, username: true },
    });
  }
  async share(actor: string, id: string, input: GrantInput, requestId: string) {
    return this.database.client.$transaction((tx) =>
      this.shareInTransaction(tx, actor, id, input, requestId),
    );
  }
  async shareInTransaction(
    tx: Transaction,
    actor: string,
    id: string,
    input: GrantInput,
    requestId: string,
  ) {
    if (Number(!!input.userId) + Number(!!input.departmentId) !== 1)
      throw new BadRequestException();
    await tx.$queryRaw`SELECT id FROM resources WHERE id=${id}::uuid FOR UPDATE`;
    const resource = await this.authorization.requireResource(actor, id, "manage_access", tx);
    if (input.permission === "download" && resource.kind !== "document")
      throw new BadRequestException();
    if (
      input.userId &&
      !(await tx.user.findFirst({ where: { id: input.userId, status: "active" } }))
    )
      throw new BadRequestException();
    if (
      input.departmentId &&
      !(await tx.department.findFirst({ where: { id: input.departmentId, active: true } }))
    )
      throw new BadRequestException();
    const row = await tx.resourceGrant.create({
      data: { resourceId: id, ...input, grantedById: actor },
    });
    await this.authorization.audit(tx, actor, "resource.shared", id, requestId, {
      grantId: row.id,
      userId: row.userId,
      departmentId: row.departmentId,
      permission: row.permission,
    });
    return row;
  }
  async revoke(actor: string, id: string, grantId: string, requestId: string) {
    return this.database.client.$transaction((tx) =>
      this.revokeInTransaction(tx, actor, id, grantId, requestId),
    );
  }
  async revokeInTransaction(
    tx: Transaction,
    actor: string,
    id: string,
    grantId: string,
    requestId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM resources WHERE id=${id}::uuid FOR UPDATE`;
    await this.authorization.requireResource(actor, id, "manage_access", tx);
    const grant = await tx.resourceGrant.findFirst({
      where: { id: grantId, resourceId: id, revokedAt: null },
    });
    if (!grant) throw new NotFoundException();
    const row = await tx.resourceGrant.update({
      where: { id: grantId },
      data: { revokedAt: new Date() },
    });
    await this.authorization.audit(tx, actor, "resource.revoked", id, requestId, { grantId });
    return row;
  }
}
