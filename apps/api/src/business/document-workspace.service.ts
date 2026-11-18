import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  documentFolderInputSchema,
  documentFolderUpdateSchema,
  documentFolderDeleteSchema,
  documentRegistrationSchema,
  documentUpdateSchema,
  documentDataSchema,
  type DocumentRegistration,
} from "@lapnet/contracts";
import type { Prisma } from "@lapnet/database";
import type { Transaction } from "../identity/authorization.service";
import type { PortalRequest } from "../http";
import {
  BusinessService,
  afterCursor,
  decodeCursor,
  encodeCursor,
  validDate,
} from "./business.service";
import { FilesService, MAX_UPLOAD, type ReceivedFile } from "./files.service";
import { ALLOWED_EXTENSIONS } from "./file-types";
import { RecordQuery } from "./dto";
import { ResourcesService } from "../identity/resources.service";
import type { GrantInput } from "../identity/dto";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class DocumentQuery extends RecordQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() folderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(["1", "0"]) descendants?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) tag?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(["quarantined", "available", "scan_failed", "rejected"])
  state?: string;
}
type Folder = Prisma.DocumentFolderGetPayload<Record<string, never>>;
const person = { id: true, displayName: true, status: true } as const;
const include = {
  resource: {
    include: {
      owner: { select: person },
      department: { select: { id: true, code: true, name: true } },
    },
  },
  parent: true,
  documentMetadata: true,
  versions: { orderBy: { number: "desc" as const } },
} satisfies Prisma.BusinessRecordInclude;
type Row = Prisma.BusinessRecordGetPayload<{ include: typeof include }>;

@Injectable()
export class DocumentWorkspaceService {
  constructor(
    private readonly business: BusinessService,
    private readonly files: FilesService,
    private readonly resources: ResourcesService,
  ) {}
  private get db() {
    return this.business.database.client;
  }
  private get auth() {
    return this.business.authorization;
  }
  private async treeLock(tx: Transaction, departmentId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${departmentId},1))`;
  }
  private async allowedDepartment(actor: string, id: string, tx: Transaction) {
    await this.business.requireDepartment(actor, id, tx);
    if (!(await tx.department.findFirst({ where: { id, active: true } })))
      throw new ForbiddenException();
  }
  private async folder(actor: string, id: string, tx: Transaction, manage = false) {
    const folder = await tx.documentFolder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException();
    const c = await this.auth.context(actor, tx);
    const member = c.departments.includes(folder.departmentId),
      editor = c.roles.some(
        (r) => r.departmentId === folder.departmentId && r.role === "resource_editor",
      );
    if (!member && !editor && folder.createdById !== actor) throw new NotFoundException();
    if (manage && !editor && folder.createdById !== actor) throw new ForbiddenException();
    return folder;
  }
  private descendants(rows: Folder[], id: string) {
    const ids = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const row of rows)
        if (row.parentId && ids.has(row.parentId) && !ids.has(row.id)) {
          ids.add(row.id);
          grew = true;
        }
    }
    return ids;
  }
  async folders(actor: string, tx: Transaction = this.db) {
    const c = await this.auth.context(actor, tx);
    const rows = await tx.documentFolder.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }] });
    const visible = new Set(
      rows
        .filter(
          (f) =>
            f.createdById === actor ||
            c.departments.includes(f.departmentId) ||
            c.roles.some((r) => r.departmentId === f.departmentId),
        )
        .map((f) => f.id),
    );
    const placed = await tx.documentMetadata.findMany({
      where: { folderId: { not: null }, document: this.business.where(c, "document") },
      select: { folderId: true },
    });
    const byId = new Map(rows.map((f) => [f.id, f]));
    for (const item of placed) {
      let f = item.folderId ? byId.get(item.folderId) : undefined;
      const visited = new Set<string>();
      while (f && !visited.has(f.id)) {
        visited.add(f.id);
        visible.add(f.id);
        f = f.parentId ? byId.get(f.parentId) : undefined;
      }
    }
    return rows
      .filter((f) => visible.has(f.id))
      .map((f) => ({
        ...f,
        canManage:
          f.createdById === actor ||
          c.roles.some((r) => r.role === "resource_editor" && r.departmentId === f.departmentId),
      }));
  }
  async createFolder(actor: string, raw: unknown, requestId: string) {
    const parsed = documentFolderInputSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException();
    const input = parsed.data;
    return this.db.$transaction(async (tx) => {
      await this.allowedDepartment(actor, input.departmentId, tx);
      await this.treeLock(tx, input.departmentId);
      if (input.parentId) {
        const parent = await this.folder(actor, input.parentId, tx);
        if (parent.departmentId !== input.departmentId) throw new BadRequestException();
      }
      const row = await tx.documentFolder.create({ data: { ...input, createdById: actor } });
      await this.auth.audit(tx, actor, "document.folder_created", row.id, requestId, {
        departmentId: row.departmentId,
      });
      return { ...row, canManage: true };
    });
  }
  async updateFolder(actor: string, id: string, raw: unknown, requestId: string) {
    const parsed = documentFolderUpdateSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException();
    const input = parsed.data;
    return this.db.$transaction(async (tx) => {
      const found = await this.folder(actor, id, tx, true);
      await this.treeLock(tx, found.departmentId);
      const old = await this.folder(actor, id, tx, true);
      if (old.revision !== input.revision) throw new ConflictException();
      if (input.parentId) {
        const parent = await this.folder(actor, input.parentId, tx);
        if (parent.departmentId !== old.departmentId) throw new BadRequestException();
        const rows = await tx.documentFolder.findMany({
          where: { departmentId: old.departmentId },
        });
        if (this.descendants(rows, id).has(input.parentId)) throw new ConflictException();
      }
      const row = await tx.documentFolder.update({
        where: { id },
        data: { name: input.name, parentId: input.parentId, revision: { increment: 1 } },
      });
      await this.auth.audit(tx, actor, "document.folder_updated", id, requestId, {
        revision: row.revision,
      });
      return { ...row, canManage: true };
    });
  }
  async deleteFolder(actor: string, id: string, raw: unknown, requestId: string) {
    const parsed = documentFolderDeleteSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException();
    const { revision, confirmationName } = parsed.data;
    return this.db.$transaction(
      async (tx) => {
        const found = await this.folder(actor, id, tx, true);
        await this.treeLock(tx, found.departmentId);
        const row = await this.folder(actor, id, tx, true);
        if (row.revision !== revision) throw new ConflictException();
        if (confirmationName !== row.name) throw new BadRequestException();
        const folders = await tx.documentFolder.findMany({
          where: { departmentId: row.departmentId },
        });
        const ids = [...this.descendants(folders, id)];
        for (const folderId of ids) await this.folder(actor, folderId, tx, true);
        const documents = await tx.documentMetadata.findMany({
          where: { folderId: { in: ids } },
          orderBy: { documentId: "asc" },
          select: { documentId: true },
        });
        for (const { documentId } of documents) {
          await tx.$queryRaw`SELECT id FROM resources WHERE id=${documentId}::uuid FOR UPDATE`;
          const resource = await tx.resource.findUniqueOrThrow({ where: { id: documentId } });
          if (resource.archivedAt) continue;
          await this.business.policy(actor, documentId, "manage_access", tx);
          await tx.resource.update({ where: { id: documentId }, data: { archivedAt: new Date() } });
          await this.business.recordChange(tx, documentId, actor, "folder_deleted", requestId);
        }
        // Retain document history and private bytes, following the existing archive policy.
        await tx.documentMetadata.updateMany({
          where: { folderId: { in: ids } },
          data: { folderId: null },
        });
        for (const folderId of ids.reverse()) {
          await tx.documentFolder.delete({ where: { id: folderId } });
          await this.auth.audit(tx, actor, "document.folder_deleted", folderId, requestId);
        }
        return { deleted: true };
      },
      { timeout: 20000 },
    );
  }
  async config(actor: string) {
    return this.db.$transaction(
      async (tx) => {
        const c = await this.auth.context(actor, tx),
          where = this.business.where(c, "document");
        const departments = await tx.department.findMany({
          where: { active: true },
          select: { id: true, name: true, code: true },
          orderBy: { code: "asc" },
        });
        const users = await tx.user.findMany({
          select: { id: true, displayName: true, status: true },
          orderBy: { displayName: "asc" },
        });
        const companies = await tx.businessRecord.findMany({
          where: this.business.where(c, "company"),
          select: { id: true, title: true },
          orderBy: { title: "asc" },
        });
        const documents = await tx.businessRecord.findMany({
          where,
          select: { id: true, data: true },
        });
        const used = await tx.documentVersion.aggregate({
          where: { document: where },
          _sum: { bytes: true },
        });
        const tags = new Set<string>();
        for (const doc of documents) {
          const data = documentDataSchema.safeParse(doc.data);
          if (data.success) data.data.tags.forEach((t) => tags.add(t));
        }
        return {
          userId: actor,
          departments: departments.map((d) => ({
            ...d,
            canCreate:
              c.departments.includes(d.id) ||
              c.roles.some((r) => r.role === "resource_editor" && r.departmentId === d.id),
          })),
          users,
          companies,
          folders: await this.folders(actor, tx),
          tags: [...tags].sort().map((name) => ({ id: name, name })),
          storage: { usedBytes: used._sum.bytes ?? 0 },
          limits: { maxFileBytes: MAX_UPLOAD, allowedExtensions: ALLOWED_EXTENSIONS },
        };
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  }
  private async serialize(actor: string, row: Row, tx: Transaction) {
    const record = await this.business.serialize(actor, row, tx),
      data = documentDataSchema.parse(row.data);
    const company = await tx.recordLink.findFirst({
      where: {
        sourceId: row.id,
        kind: "company",
        target: { kind: "company", AND: [this.auth.where(await this.auth.context(actor, tx))] },
      },
      select: { targetId: true },
    });
    const versions = row.versions.map((version) => ({
      id: version.id,
      number: version.number,
      filename: version.filename,
      mime: version.mime,
      bytes: version.bytes,
      sha256: version.sha256,
      state: version.state,
      scanError: version.scanError,
      createdAt: version.createdAt,
      uploadedById: version.uploadedById,
      note: version.note,
    }));
    return {
      ...record,
      data,
      folderId: row.documentMetadata?.folderId ?? null,
      registryNumber: row.documentMetadata?.registryNumber ?? null,
      companyId: company?.targetId ?? null,
      versions,
      movements: await tx.documentMovement.findMany({
        where: {
          documentId: row.id,
          OR: [
            { counterpartyId: null },
            { counterparty: this.auth.where(await this.auth.context(actor, tx)) },
          ],
        },
        orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
      }),
    };
  }
  async list(actor: string, q: DocumentQuery) {
    return this.db.$transaction(
      async (tx) => {
        const c = await this.auth.context(actor, tx),
          cursor = decodeCursor(q.cursor),
          and: Prisma.BusinessRecordWhereInput[] = [this.business.where(c, "document")];
        if (q.folderId) {
          const folders = await this.folders(actor, tx);
          if (!folders.some((f) => f.id === q.folderId)) throw new NotFoundException();
          const ids =
            q.descendants === "0" ? [q.folderId] : [...this.descendants(folders, q.folderId)];
          and.push({ documentMetadata: { folderId: { in: ids } } });
        }
        if (q.departmentId) and.push({ resource: { ownerDepartmentId: q.departmentId } });
        if (q.direction) and.push({ data: { path: ["direction"], equals: q.direction } });
        if (q.tag) and.push({ data: { path: ["tags"], array_contains: [q.tag] } });
        if (q.state) and.push({ versions: { some: { state: q.state } } });
        if (q.from || q.to) {
          if (q.from) validDate(q.from);
          if (q.to) validDate(q.to);
          if (q.from && q.to && q.from > q.to) throw new BadRequestException();
          and.push({
            data: {
              path: ["issueDate"],
              ...(q.from ? { gte: q.from } : {}),
              ...(q.to ? { lte: q.to } : {}),
            },
          });
        }
        if (q.companyId) {
          await this.business.detail(actor, "company", q.companyId);
          and.push({
            resource: { sourceLinks: { some: { targetId: q.companyId, kind: "company" } } },
          });
        }
        if (q.q?.trim()) {
          const term = q.q.trim();
          const code = /^REG-(\d+)$/i.exec(term);
          const number = code ? Number(code[1]) : 0;
          and.push({
            OR: [
              { title: { contains: term, mode: "insensitive" } },
              ...(code && Number.isInteger(number) && number > 0 && number <= 2147483647
                ? [{ number }]
                : []),
              { documentMetadata: { registryNumber: { contains: term, mode: "insensitive" } } },
              { data: { path: ["externalNumber"], string_contains: term } },
              { versions: { some: { filename: { contains: term, mode: "insensitive" } } } },
            ],
          });
        }
        const where = { AND: and },
          total = await tx.businessRecord.count({ where });
        const rows = await tx.businessRecord.findMany({
          where: { AND: [where, ...afterCursor(cursor)] },
          include,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: q.limit + 1,
        });
        const items = [];
        for (const row of rows.slice(0, q.limit)) items.push(await this.serialize(actor, row, tx));
        return {
          items,
          total,
          nextCursor: rows.length > q.limit ? encodeCursor(rows[q.limit - 1]) : null,
        };
      },
      { isolationLevel: "RepeatableRead", timeout: 20000 },
    );
  }
  async detail(actor: string, id: string) {
    await this.business.detail(actor, "document", id);
    const detail = await this.db.$transaction(
      async (tx) => {
        await this.business.policy(actor, id, "view", tx);
        const row = await tx.businessRecord.findFirst({
          where: { id, resource: { kind: "document" } },
          include,
        });
        if (!row) throw new NotFoundException();
        const result = await this.serialize(actor, row, tx);
        const grants = result.permissions.manageAccess
          ? await tx.resourceGrant.findMany({
              where: { resourceId: id, revokedAt: null },
              select: { id: true, userId: true, departmentId: true, permission: true },
            })
          : [];
        const revisions = await tx.businessRevision.findMany({
          where: { recordId: id },
          select: { id: true, revision: true, actorId: true, occurredAt: true, snapshot: true },
          orderBy: { revision: "desc" },
          take: 100,
        });
        const history = revisions.map(({ snapshot, ...h }) => ({
          ...h,
          action: String((snapshot as Prisma.JsonObject).action ?? "updated"),
        }));
        // Business histories remain append-only. Only current authorized readers receive them.
        return { ...result, grants, history };
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
    return { ...detail, links: await this.business.links(actor, id) };
  }
  async register(actor: string, r: PortalRequest) {
    const text = this.files.decodeHeader(r, "x-document-metadata", 6000);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new BadRequestException();
    }
    const parsed = documentRegistrationSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException();
    const input = parsed.data;
    // Reject unauthorized uploads before accepting bytes, then recheck in the commit transaction.
    await this.allowedDepartment(actor, input.departmentId, this.db);
    return this.files.receive(r, (tx, file) => this.create(tx, actor, input, file, r.requestId));
  }
  private async company(tx: Transaction, actor: string, id: string, companyId: string | null) {
    if (companyId) {
      const row = await this.business.policy(actor, companyId, "view", tx);
      if (row.kind !== "company") throw new BadRequestException();
    }
    await tx.recordLink.deleteMany({ where: { sourceId: id, kind: "company" } });
    if (companyId)
      await tx.recordLink.create({ data: { sourceId: id, targetId: companyId, kind: "company" } });
  }
  private async place(
    tx: Transaction,
    actor: string,
    folderId: string | null,
    departmentId: string,
  ) {
    if (folderId) {
      await this.treeLock(tx, departmentId);
      const f = await this.folder(actor, folderId, tx);
      if (f.departmentId !== departmentId) throw new BadRequestException();
    }
  }
  private async create(
    tx: Transaction,
    actor: string,
    input: DocumentRegistration,
    file: ReceivedFile,
    requestId: string,
  ) {
    await this.allowedDepartment(actor, input.departmentId, tx);
    await this.place(tx, actor, input.folderId, input.departmentId);
    const id = randomUUID();
    await tx.resource.create({
      data: { id, kind: "document", ownerUserId: actor, ownerDepartmentId: input.departmentId },
    });
    await tx.businessRecord.create({ data: { id, title: input.title, data: input.data } });
    await tx.documentMetadata.create({
      data: {
        documentId: id,
        departmentId: input.departmentId,
        folderId: input.folderId,
        registryNumber: input.registryNumber,
      },
    });
    await this.company(tx, actor, id, input.companyId);
    if (input.movement)
      await tx.documentMovement.create({
        data: {
          documentId: id,
          actorId: actor,
          direction: input.data.direction === "outgoing" ? "outgoing" : "incoming",
          ...input.movement,
          occurredOn: validDate(input.movement.occurredOn),
          counterpartyId: input.companyId,
        },
      });
    const version = await this.files.persist(tx, actor, id, file);
    const row = await tx.businessRecord.findUniqueOrThrow({ where: { id }, include });
    await this.business.saveRevision(tx, row, actor, "registered", requestId);
    return { id, revision: row.revision, version };
  }
  async update(actor: string, id: string, raw: unknown, requestId: string) {
    const parsed = documentUpdateSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException();
    const input = parsed.data;
    await this.db.$transaction(
      async (tx) => {
        // Folder deletion and placement acquire the tree lock before resource locks.
        const resource = await tx.resource.findUnique({
          where: { id },
          select: { ownerDepartmentId: true },
        });
        if (resource) await this.treeLock(tx, resource.ownerDepartmentId);
        await tx.$queryRaw`SELECT id FROM resources WHERE id=${id}::uuid FOR UPDATE`;
        const policy = await this.business.policy(actor, id, "edit", tx);
        if (policy.kind !== "document") throw new NotFoundException();
        const old = await tx.businessRecord.findUniqueOrThrow({ where: { id }, include });
        if (old.revision !== input.revision) throw new ConflictException();
        if (input.folderId !== undefined)
          await this.place(tx, actor, input.folderId, old.resource.ownerDepartmentId);
        await tx.documentMetadata.upsert({
          where: { documentId: id },
          create: {
            documentId: id,
            departmentId: old.resource.ownerDepartmentId,
            folderId: input.folderId,
            registryNumber: input.registryNumber,
          },
          update: { folderId: input.folderId, registryNumber: input.registryNumber },
        });
        if (input.companyId !== undefined) await this.company(tx, actor, id, input.companyId);
        const row = await tx.businessRecord.update({
          where: { id },
          data: { title: input.title, data: input.data, revision: { increment: 1 } },
          include,
        });
        await this.business.saveRevision(tx, row, actor, "updated", requestId);
      },
      { timeout: 15000 },
    );
    return this.detail(actor, id);
  }
  async unlink(actor: string, id: string, linkId: string, requestId: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM resources WHERE id=${id}::uuid FOR UPDATE`;
      const policy = await this.business.policy(actor, id, "edit", tx);
      if (policy.kind !== "document") throw new NotFoundException();
      const link = await tx.recordLink.findFirst({
        where: { id: linkId, OR: [{ sourceId: id }, { targetId: id }] },
      });
      if (!link) throw new NotFoundException();
      await this.business.policy(
        actor,
        link.sourceId === id ? link.targetId : link.sourceId,
        "view",
        tx,
      );
      await tx.recordLink.delete({ where: { id: linkId } });
      await this.business.recordChange(tx, id, actor, "unlinked", requestId);
      return { deleted: true };
    });
  }
  async share(actor: string, id: string, input: GrantInput, requestId: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM resources WHERE id=${id}::uuid FOR UPDATE`;
      const policy = await this.business.policy(actor, id, "manage_access", tx);
      if (policy.kind !== "document") throw new NotFoundException();
      const grants = [];
      let changed = false;
      for (const permission of [...new Set(["view" as const, input.permission])]) {
        const existing = await tx.resourceGrant.findFirst({
          where: {
            resourceId: id,
            revokedAt: null,
            userId: input.userId ?? null,
            departmentId: input.departmentId ?? null,
            permission,
          },
        });
        if (existing) {
          grants.push(existing);
          continue;
        }
        grants.push(
          await this.resources.shareInTransaction(
            tx,
            actor,
            id,
            { ...input, permission },
            requestId,
          ),
        );
        changed = true;
      }
      if (changed) await this.business.recordChange(tx, id, actor, "access_granted", requestId);
      return grants;
    });
  }
  async revoke(actor: string, id: string, grantId: string, requestId: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM resources WHERE id=${id}::uuid FOR UPDATE`;
      const policy = await this.business.policy(actor, id, "manage_access", tx);
      if (policy.kind !== "document") throw new NotFoundException();
      const grant = await this.resources.revokeInTransaction(tx, actor, id, grantId, requestId);
      await this.business.recordChange(tx, id, actor, "access_revoked", requestId);
      return grant;
    });
  }
}
