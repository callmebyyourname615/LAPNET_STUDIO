import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@lapnet/database";
import {
  companyDataSchema,
  postDataSchema,
  interactionDataSchema,
  documentDataSchema,
  type BusinessKind,
} from "@lapnet/contracts";
import { DatabaseService } from "../database.service";
import {
  AuthorizationService,
  current,
  type Transaction,
  type Permission,
} from "../identity/authorization.service";
import {
  RecordInput,
  RecordQuery,
  CommentInput,
  ContactInput,
  MovementInput,
  LinkInput,
  MentionInput,
  MentionTargetsQuery,
} from "./dto";
import { enqueueNotification } from "./events";
import { TasksService } from "../tasks/tasks.service";
import { taskTeamRecipients, teamInclude } from "../tasks/team";
const person = { id: true, displayName: true, status: true } as const;
const include = {
  resource: {
    include: {
      owner: { select: person },
      department: { select: { id: true, code: true, name: true } },
    },
  },
  parent: true,
} satisfies Prisma.BusinessRecordInclude;
type Row = Prisma.BusinessRecordGetPayload<{ include: typeof include }>;
type Context = Awaited<ReturnType<AuthorizationService["context"]>>;
const schemas = {
  post: postDataSchema,
  company: companyDataSchema,
  interaction: interactionDataSchema,
  document: documentDataSchema,
};
const prefixes = { post: "POST", company: "CO", interaction: "INT", document: "REG" };
export function validDate(value: string) {
  const d = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value)
    throw new BadRequestException();
  return d;
}
export function encodeCursor(row: { createdAt: Date; id: string }) {
  return Buffer.from(JSON.stringify({ at: row.createdAt.toISOString(), id: row.id })).toString(
    "base64url",
  );
}
export function decodeCursor(value?: string) {
  if (!value) return null;
  try {
    const v = JSON.parse(Buffer.from(value, "base64url").toString()) as { at: string; id: string };
    if (
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.at) ||
      !Number.isFinite(Date.parse(v.at)) ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v.id)
    )
      throw Error();
    return { id: v.id, createdAt: new Date(v.at) };
  } catch {
    throw new BadRequestException();
  }
}
export const afterCursor = (v: ReturnType<typeof decodeCursor>) =>
  v
    ? [{ OR: [{ createdAt: { lt: v.createdAt } }, { createdAt: v.createdAt, id: { lt: v.id } }] }]
    : [];

@Injectable()
export class BusinessService {
  constructor(
    readonly database: DatabaseService,
    readonly authorization: AuthorizationService,
    private readonly tasks: TasksService,
  ) {}
  where(
    context: Context,
    kind?: BusinessKind,
    permission: Permission = "view",
  ): Prisma.BusinessRecordWhereInput {
    return {
      resource: {
        kind: kind ?? { in: ["post", "company", "interaction", "document"] },
        archivedAt: null,
      },
      OR: [
        { parentId: null, resource: this.authorization.where(context, permission) },
        { parentId: { not: null }, parent: this.authorization.where(context, permission) },
      ],
    };
  }
  async policy(
    actor: string,
    id: string,
    permission: Permission = "view",
    tx: Transaction = this.database.client,
  ) {
    const row = await tx.businessRecord.findUnique({
      where: { id },
      select: { parentId: true, resource: { select: { archivedAt: true } } },
    });
    if (row?.resource.archivedAt) throw new NotFoundException();
    return this.authorization.requireResource(actor, row?.parentId ?? id, permission, tx);
  }
  private parse(kind: BusinessKind, data: Record<string, unknown>) {
    const parsed = schemas[kind].safeParse(data);
    if (!parsed.success) throw new BadRequestException();
    return parsed.data as Prisma.InputJsonObject;
  }
  async serialize(actor: string, row: Row, tx: Transaction) {
    const c = await this.authorization.context(actor, tx),
      id = row.parentId ?? row.id;
    const rights: Record<string, boolean> = { view: true };
    for (const permission of ["edit", "comment", "manage_access", "download"] as const)
      rights[permission] = !!(await tx.resource.findFirst({
        where: { id, AND: [this.authorization.where(c, permission)] },
        select: { id: true },
      }));
    return {
      id: row.id,
      code: `${prefixes[row.resource.kind as BusinessKind]}-${row.number}`,
      kind: row.resource.kind,
      title: row.title,
      data: row.data,
      revision: row.revision,
      parentId: row.parentId,
      occurredOn: row.occurredOn?.toISOString().slice(0, 10) ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      owner: row.resource.owner,
      department: row.resource.department,
      permissions: {
        view: true,
        edit: rights.edit,
        comment: rights.comment,
        manageAccess: rights.manage_access,
        download: row.resource.kind === "document" && rights.download,
      },
    };
  }
  async list(actor: string, kind: BusinessKind, q: RecordQuery) {
    return this.database.client.$transaction(
      async (tx) => {
        const context = await this.authorization.context(actor, tx),
          cursor = decodeCursor(q.cursor);
        const and: Prisma.BusinessRecordWhereInput[] = [this.where(context, kind)];
        if (q.q?.trim())
          and.push({
            OR: [
              { title: { contains: q.q.trim(), mode: "insensitive" } },
              ...(kind === "document"
                ? [{ data: { path: ["externalNumber"], string_contains: q.q.trim() } }]
                : []),
              ...(kind === "company"
                ? [{ data: { path: ["legalName"], string_contains: q.q.trim() } }]
                : []),
            ],
          });
        if (q.departmentId) and.push({ resource: { ownerDepartmentId: q.departmentId } });
        if (q.direction) and.push({ data: { path: ["direction"], equals: q.direction } });
        if (q.companyId) {
          await this.policy(actor, q.companyId, "view", tx);
          const links = await tx.recordLink.findMany({
            where: { OR: [{ sourceId: q.companyId }, { targetId: q.companyId }] },
            select: { sourceId: true, targetId: true },
          });
          and.push({
            id: { in: links.map((x) => (x.sourceId === q.companyId ? x.targetId : x.sourceId)) },
          });
        }
        const where = { AND: and };
        const total = await tx.businessRecord.count({ where });
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
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  }
  async detail(actor: string, kind: BusinessKind, id: string) {
    return this.database.client.$transaction(async (tx) => {
      await this.policy(actor, id, "view", tx);
      const row = await tx.businessRecord.findFirst({ where: { id, resource: { kind } }, include });
      if (!row) throw new NotFoundException();
      return this.serialize(actor, row, tx);
    });
  }
  async requireDepartment(actor: string, departmentId: string | undefined, tx: Transaction) {
    const context = await this.authorization.context(actor, tx);
    const allowed = [
      ...context.departments,
      ...context.roles
        .filter((r) => r.role === "resource_editor" && r.departmentId)
        .map((r) => r.departmentId!),
    ];
    if (!departmentId || !allowed.includes(departmentId)) throw new ForbiddenException();
    return departmentId;
  }
  async saveRevision(tx: Transaction, row: Row, actor: string, action: string, requestId: string) {
    await tx.businessRevision.create({
      data: {
        recordId: row.id,
        revision: row.revision,
        actorId: actor,
        snapshot: JSON.parse(
          JSON.stringify({
            title: row.title,
            data: row.data as Prisma.InputJsonObject,
            archived: !!row.resource.archivedAt,
            action,
            documentMetadata: await tx.documentMetadata.findUnique({
              where: { documentId: row.id },
            }),
            contacts: await tx.companyContact.findMany({ where: { companyId: row.id } }),
            versions: await tx.documentVersion.findMany({
              where: { documentId: row.id },
              select: {
                id: true,
                number: true,
                filename: true,
                mime: true,
                bytes: true,
                sha256: true,
                createdAt: true,
              },
            }),
            movements: (await tx.documentMovement.findMany({ where: { documentId: row.id } })).map(
              (x) => ({
                ...x,
                occurredOn: x.occurredOn.toISOString(),
                createdAt: x.createdAt.toISOString(),
              }),
            ),
          }),
        ) as Prisma.InputJsonObject,
      },
    });
    await this.authorization.audit(tx, actor, `${row.resource.kind}.${action}`, row.id, requestId, {
      revision: row.revision,
    });
  }
  async recordChange(
    tx: Transaction,
    id: string,
    actor: string,
    action: string,
    requestId: string,
  ) {
    const row = await tx.businessRecord.update({
      where: { id },
      data: { revision: { increment: 1 } },
      include,
    });
    await this.saveRevision(tx, row, actor, action, requestId);
  }
  async mentions(
    tx: Transaction,
    actor: string,
    sourceId: string,
    resourceId: string,
    targets: MentionInput[],
  ) {
    for (const target of targets) {
      let recipients: string[] = [];
      if (target.type === "user") recipients = [target.id];
      if (target.type === "department")
        recipients = (
          await tx.departmentMembership.findMany({
            where: {
              departmentId: target.id,
              ...current(),
              department: { active: true },
              user: { status: "active" },
            },
            select: { userId: true },
          })
        ).map((x) => x.userId);
      if (target.type === "position")
        recipients = (
          await tx.positionAssignment.findMany({
            where: { positionId: target.id, ...current(), user: { status: "active" } },
            select: { userId: true },
          })
        ).map((x) => x.userId);
      if (!recipients.length) throw new BadRequestException();
      for (const recipientId of new Set(recipients)) {
        if (!(await tx.user.findFirst({ where: { id: recipientId, status: "active" } }))) {
          if (target.type === "user") throw new BadRequestException();
          continue;
        }
        const context = await this.authorization.context(recipientId, tx);
        const permitted = await tx.resource.findFirst({
          where: { id: resourceId, AND: [this.authorization.where(context)] },
          select: { id: true },
        });
        if (!permitted) {
          if (target.type === "user") throw new BadRequestException();
          continue;
        }
        const existing = await tx.mention.findUnique({
          where: {
            sourceId_targetType_targetId_recipientId: {
              sourceId,
              targetType: target.type,
              targetId: target.id,
              recipientId,
            },
          },
        });
        if (!existing) {
          await tx.mention.create({
            data: { sourceId, targetType: target.type, targetId: target.id, recipientId },
          });
          await enqueueNotification(
            tx,
            resourceId,
            [recipientId],
            "mention",
            `mention:${sourceId}:${target.type}:${target.id}`,
            actor,
          );
        }
      }
    }
  }
  async write(
    actor: string,
    kind: BusinessKind,
    input: RecordInput,
    requestId: string,
    id?: string,
  ) {
    const payload = this.parse(kind, input.data),
      recordId = id ?? randomUUID();
    await this.database.client.$transaction(
      async (tx) => {
        let previous: Row | null = null;
        if (id) {
          await tx.$queryRaw`SELECT id FROM resources WHERE id=${id}::uuid FOR UPDATE`;
          await this.policy(actor, id, "edit", tx);
          previous = await tx.businessRecord.findFirst({
            where: { id, resource: { kind } },
            include,
          });
          if (!previous) throw new NotFoundException();
          if (input.revision !== previous.revision) throw new ConflictException();
          if (input.parentId && input.parentId !== previous.parentId)
            throw new BadRequestException();
        }
        let departmentId = input.departmentId;
        if (!id) {
          if (input.parentId) {
            if (kind !== "post") throw new BadRequestException();
            const parent = await this.authorization.requireResource(
              actor,
              input.parentId,
              "comment",
              tx,
            );
            if (parent.kind !== "task") throw new BadRequestException();
            departmentId = parent.ownerDepartmentId;
          } else departmentId = await this.requireDepartment(actor, departmentId, tx);
          await tx.resource.create({
            data: { id: recordId, kind, ownerUserId: actor, ownerDepartmentId: departmentId! },
          });
        }
        const policyId = previous?.parentId ?? input.parentId ?? recordId;
        if (input.shareUsers.length || input.shareDepartments.length) {
          await this.authorization.requireResource(actor, policyId, "manage_access", tx);
          for (const userId of input.shareUsers) {
            if (!(await tx.user.findFirst({ where: { id: userId, status: "active" } })))
              throw new BadRequestException();
            for (const permission of ["view", "comment"] as const)
              await tx.resourceGrant.create({
                data: { resourceId: policyId, userId, permission, grantedById: actor },
              });
          }
          for (const dep of input.shareDepartments) {
            if (!(await tx.department.findFirst({ where: { id: dep, active: true } })))
              throw new BadRequestException();
            for (const permission of ["view", "comment"] as const)
              await tx.resourceGrant.create({
                data: { resourceId: policyId, departmentId: dep, permission, grantedById: actor },
              });
          }
        }
        let occurredOn: Date | null = null;
        if (kind === "interaction") {
          const companyId = payload.companyId as string;
          const company = await this.authorization.requireResource(actor, companyId, "view", tx);
          if (company.kind !== "company") throw new BadRequestException();
          occurredOn = validDate(payload.occurredOn as string);
        }
        const row = id
          ? await tx.businessRecord.update({
              where: { id },
              data: {
                title: input.title.trim(),
                data: payload,
                occurredOn,
                revision: { increment: 1 },
              },
              include,
            })
          : await tx.businessRecord.create({
              data: {
                id: recordId,
                title: input.title.trim(),
                data: payload,
                occurredOn,
                parentId: input.parentId,
              },
              include,
            });
        if (!row.title) throw new BadRequestException();
        if (kind === "interaction") {
          await tx.recordLink.deleteMany({ where: { sourceId: recordId, kind: "company" } });
          await tx.recordLink.create({
            data: { sourceId: recordId, targetId: payload.companyId as string, kind: "company" },
          });
          await tx.businessEvent.upsert({
            where: { key: "interaction:" + recordId },
            create: {
              key: "interaction:" + recordId,
              companyId: payload.companyId as string,
              sourceId: recordId,
              type: "interaction",
              occurredOn: occurredOn!,
              detail: {},
            },
            update: { companyId: payload.companyId as string, occurredOn: occurredOn! },
          });
        }
        await this.saveRevision(tx, row, actor, id ? "updated" : "created", requestId);
        await this.mentions(tx, actor, recordId, policyId, input.mentions);
      },
      { timeout: 20000 },
    );
    return this.detail(actor, kind, recordId);
  }
  async archive(
    actor: string,
    kind: BusinessKind,
    id: string,
    revision: number,
    requestId: string,
  ) {
    await this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM resources WHERE id=${id}::uuid FOR UPDATE`;
      await this.policy(actor, id, "manage_access", tx);
      const existing = await tx.businessRecord.findFirst({
        where: { id, resource: { kind } },
        include,
      });
      if (!existing) throw new NotFoundException();
      if (existing.revision !== revision) throw new ConflictException();
      await tx.resource.update({ where: { id }, data: { archivedAt: new Date() } });
      const row = await tx.businessRecord.update({
        where: { id },
        data: { revision: { increment: 1 } },
        include,
      });
      await this.saveRevision(tx, row, actor, "archived", requestId);
    });
    return { archived: true };
  }
  async history(actor: string, id: string, q: RecordQuery) {
    await this.policy(actor, id);
    const rows = await this.database.client.businessRevision.findMany({
      where: {
        recordId: id,
        ...(q.cursor
          ? {
              OR: [
                { occurredAt: { lt: decodeCursor(q.cursor)!.createdAt } },
                {
                  occurredAt: decodeCursor(q.cursor)!.createdAt,
                  id: { lt: decodeCursor(q.cursor)!.id },
                },
              ],
            }
          : {}),
      },
      include: { actor: { select: person } },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
    });
    return {
      items: rows.slice(0, q.limit),
      nextCursor:
        rows.length > q.limit
          ? encodeCursor({ id: rows[q.limit - 1].id, createdAt: rows[q.limit - 1].occurredAt })
          : null,
    };
  }
  async comments(actor: string, id: string, q: RecordQuery) {
    await this.policy(actor, id);
    const rows = await this.database.client.resourceComment.findMany({
      where: {
        resourceId: id,
        archivedAt: null,
        AND: afterCursor(decodeCursor(q.cursor)),
      },
      include: {
        author: {
          select: {
            ...person,
            images: { where: { kind: "avatar" }, select: { revision: true } },
            memberships: {
              where: { ...current(), department: { active: true } },
              select: { department: { select: { name: true } } },
              orderBy: { department: { code: "asc" } },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
    });
    return {
      items: rows
        .slice(0, q.limit)
        .map(({ author: { memberships, images, ...author }, ...row }) => ({
          ...row,
          author: {
            ...author,
            departments: memberships.map(({ department }) => department.name),
            avatarUrl: images[0]
              ? `/api/v1/resources/${id}/comments/${row.id}/avatar?v=${images[0].revision}`
              : null,
          },
          canEdit: row.authorId === actor,
        })),
      nextCursor: rows.length > q.limit ? encodeCursor(rows[q.limit - 1]) : null,
    };
  }
  async commentAvatarAuthor(actor: string, id: string, commentId: string) {
    await this.policy(actor, id);
    const row = await this.database.client.resourceComment.findFirst({
      where: { id: commentId, resourceId: id, archivedAt: null },
      select: { authorId: true },
    });
    if (!row) throw new NotFoundException();
    return row.authorId;
  }
  async comment(
    actor: string,
    id: string,
    input: CommentInput,
    requestId: string,
    commentId?: string,
    archive = false,
  ) {
    return this.database.client.$transaction(async (tx) => {
      const policy = await this.policy(actor, id, "comment", tx);
      await tx.$queryRaw`SELECT id FROM resources WHERE id=${policy.id}::uuid FOR UPDATE`;
      await this.policy(actor, id, "comment", tx);
      const old = commentId
        ? await tx.resourceComment.findFirst({
            where: { id: commentId, resourceId: id, archivedAt: null },
          })
        : null;
      if (commentId && !old) throw new NotFoundException();
      if (old && (old.authorId !== actor || old.revision !== input.revision)) {
        if (old.authorId !== actor) throw new ForbiddenException();
        throw new ConflictException();
      }
      const text = input.text.trim();
      if (!text) throw new BadRequestException();
      const row = old
        ? await tx.resourceComment.update({
            where: { id: old.id },
            data: {
              text,
              revision: { increment: 1 },
              ...(archive ? { archivedAt: new Date() } : {}),
            },
          })
        : await tx.resourceComment.create({ data: { resourceId: id, authorId: actor, text } });
      await tx.commentRevision.create({
        data: {
          commentId: row.id,
          revision: row.revision,
          actorId: actor,
          text,
          archived: archive,
        },
      });
      await this.authorization.audit(
        tx,
        actor,
        archive ? "comment.archived" : old ? "comment.edited" : "comment.created",
        id,
        requestId,
        { commentId: row.id, revision: row.revision },
      );
      if (!archive) {
        if (policy.kind === "task" && policy.ownerUserId === actor)
          await this.tasks.inviteFromMentions(tx, actor, policy.id, input.mentions, requestId);
        await this.mentions(tx, actor, row.id, policy.id, input.mentions);
        const task = await tx.task.findUnique({
          where: { id: policy.id },
          include: {
            ...teamInclude,
            resource: true,
            collaborators: { include: { user: { select: { id: true } } } },
          },
        });
        await enqueueNotification(
          tx,
          policy.id,
          task ? await taskTeamRecipients(tx, task) : [policy.ownerUserId],
          "comment",
          `comment:${row.id}:${row.revision}`,
          actor,
        );
      }
      return { id: row.id };
    });
  }
  async mentionTargets(actor: string, q: MentionTargetsQuery) {
    await this.authorization.context(actor);
    if (q.resourceId) {
      const resource = await this.authorization.requireResource(actor, q.resourceId, "comment");
      if (resource.kind !== "task") throw new BadRequestException();
    }
    const term = q.q?.trim() ?? "";
    const users =
      term.length >= 2 || q.resourceId
        ? await this.database.client.user.findMany({
            where: {
              status: "active",
              username: { not: null },
              OR: [
                { displayName: { contains: term, mode: "insensitive" } },
                { username: { contains: term, mode: "insensitive" } },
              ],
            },
            select: { id: true, displayName: true },
            take: 25,
            orderBy: { id: "asc" },
          })
        : [];
    const departments = await this.database.client.department.findMany({
      where: {
        active: true,
        ...(term ? { name: { contains: term, mode: "insensitive" as const } } : {}),
      },
      select: { id: true, name: true },
      take: 10,
      orderBy: { code: "asc" },
    });
    const positions = await this.database.client.position.findMany({
      where: term
        ? {
            OR: [
              { code: { contains: term, mode: "insensitive" } },
              { label: { contains: term, mode: "insensitive" } },
            ],
          }
        : {},
      select: { id: true, label: true },
      take: 10,
      orderBy: { code: "asc" },
    });
    return { users, departments, positions };
  }
  async contacts(actor: string, id: string) {
    await this.detail(actor, "company", id);
    return this.database.client.companyContact.findMany({
      where: { companyId: id },
      orderBy: { id: "asc" },
      take: 100,
    });
  }
  async contact(
    actor: string,
    id: string,
    input: ContactInput,
    requestId: string,
    contactId?: string,
  ) {
    return this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM resources WHERE id=${id}::uuid FOR UPDATE`;
      await this.policy(actor, id, "edit", tx);
      const company = await tx.businessRecord.findFirst({
        where: { id, resource: { kind: "company" } },
      });
      if (!company) throw new NotFoundException();
      const old = contactId
        ? await tx.companyContact.findFirst({ where: { id: contactId, companyId: id } })
        : null;
      if (contactId && !old) throw new NotFoundException();
      if (old && input.revision !== old.revision) throw new ConflictException();
      const fields = {
        displayName: input.displayName,
        position: input.position,
        email: input.email,
        phone: input.phone,
        active: input.active,
      };
      const row = old
        ? await tx.companyContact.update({
            where: { id: old.id },
            data: { ...fields, revision: { increment: 1 } },
          })
        : await tx.companyContact.create({ data: { companyId: id, ...fields } });
      await this.authorization.audit(tx, actor, "company.contact_updated", id, requestId, {
        contactId: row.id,
        revision: row.revision,
      });
      await this.recordChange(tx, id, actor, "contact_updated", requestId);
      return row;
    });
  }
  async movements(actor: string, id: string) {
    await this.detail(actor, "document", id);
    const c = await this.authorization.context(actor);
    return this.database.client.documentMovement.findMany({
      where: {
        documentId: id,
        OR: [{ counterpartyId: null }, { counterparty: this.authorization.where(c) }],
      },
      orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
      take: 100,
    });
  }
  async movement(actor: string, id: string, input: MovementInput, requestId: string) {
    return this.database.client.$transaction(async (tx) => {
      await this.policy(actor, id, "edit", tx);
      await tx.$queryRaw`SELECT id FROM resources WHERE id=${id}::uuid FOR UPDATE`;
      await this.policy(actor, id, "edit", tx);
      const doc = await tx.businessRecord.findFirst({
        where: { id, resource: { kind: "document" } },
      });
      if (!doc) throw new NotFoundException();
      const documentData = documentDataSchema.parse(doc.data);
      if (
        documentData.direction === "internal" ||
        (documentData.issueDate && input.occurredOn < documentData.issueDate)
      )
        throw new BadRequestException();
      if (!input.counterpartyId && !input.counterpartyName.trim()) throw new BadRequestException();
      if (input.counterpartyId) {
        const cp = await this.policy(actor, input.counterpartyId, "view", tx);
        if (cp.kind !== "company") throw new BadRequestException();
      }
      const row = await tx.documentMovement.create({
        data: { documentId: id, ...input, occurredOn: validDate(input.occurredOn), actorId: actor },
      });
      if (input.counterpartyId)
        await tx.businessEvent.create({
          data: {
            key: "movement:" + row.id,
            companyId: input.counterpartyId,
            sourceId: id,
            type: input.direction,
            occurredOn: row.occurredOn,
            detail: { movementId: row.id, reference: row.reference },
          },
        });
      await this.authorization.audit(tx, actor, "document.movement_registered", id, requestId, {
        movementId: row.id,
      });
      await this.recordChange(tx, id, actor, "movement_registered", requestId);
      return row;
    });
  }
  async link(actor: string, sourceId: string, input: LinkInput, requestId: string) {
    return this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM resources WHERE id=${sourceId}::uuid FOR UPDATE`;
      await this.policy(actor, sourceId, "edit", tx);
      await this.policy(actor, input.targetId, "view", tx);
      if (sourceId === input.targetId) throw new BadRequestException();
      const link = { sourceId, targetId: input.targetId, kind: input.kind };
      const existing = await tx.recordLink.findUnique({ where: { sourceId_targetId_kind: link } });
      if (existing) return existing;
      const row = await tx.recordLink.create({
        data: link,
      });
      await this.authorization.audit(tx, actor, "resource.linked", sourceId, requestId, {
        linkId: row.id,
        targetId: input.targetId,
        kind: input.kind,
      });
      return row;
    });
  }
  async links(actor: string, id: string) {
    await this.policy(actor, id);
    const context = await this.authorization.context(actor);
    const rows = await this.database.client.recordLink.findMany({
      where: {
        OR: [
          { sourceId: id, target: this.authorization.where(context) },
          { targetId: id, source: this.authorization.where(context) },
        ],
      },
      include: {
        source: { include: { business: true, task: true } },
        target: { include: { business: true, task: true } },
      },
      orderBy: { id: "asc" },
      take: 100,
    });
    const items = [];
    for (const row of rows) {
      const target = row.sourceId === id ? row.target : row.source;
      try {
        await this.policy(actor, target.id);
        items.push({
          linkId: row.id,
          id: target.id,
          kind: target.kind,
          title: target.business?.title ?? target.task?.title ?? "",
          href: this.href(target.kind, target.id),
        });
      } catch {
        continue;
      }
    }
    return items;
  }
  async taskDocuments(actor: string, id: string) {
    return this.database.client.$transaction(
      async (tx) => {
        const task = await this.authorization.requireResource(actor, id, "view", tx);
        if (task.kind !== "task") throw new NotFoundException();
        const context = await this.authorization.context(actor, tx);
        const linkFields = {
          id: true,
          sourceId: true,
          targetId: true,
          kind: true,
          createdAt: true,
        } as const;
        const documents = await tx.businessRecord.findMany({
          where: {
            AND: [
              this.where(context, "document"),
              {
                OR: [
                  { resource: { sourceLinks: { some: { targetId: id } } } },
                  { resource: { targetLinks: { some: { sourceId: id } } } },
                ],
              },
            ],
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: 100,
          select: {
            id: true,
            title: true,
            resource: {
              select: {
                sourceLinks: { where: { targetId: id }, select: linkFields },
                targetLinks: { where: { sourceId: id }, select: linkFields },
              },
            },
            versions: {
              orderBy: { number: "desc" },
              take: 20,
              select: {
                id: true,
                number: true,
                createdAt: true,
                filename: true,
                uploadedById: true,
              },
            },
          },
        });
        const links = documents.flatMap(({ resource }) => [
          ...resource.sourceLinks,
          ...resource.targetLinks,
        ]);
        const versions = documents.flatMap(({ versions }) => versions);
        const uploadedBy = versions.flatMap((version) =>
          version.uploadedById ? [version.uploadedById] : [],
        );
        const [linkAudit, uploaders] = await Promise.all([
          tx.auditEvent.findMany({
            where: {
              action: "resource.linked",
              targetId: { in: [...new Set(links.map((link) => link.sourceId))] },
              OR: [
                { occurredAt: { in: links.map((link) => link.createdAt) } },
                ...links.map((link) => ({ metadata: { path: ["linkId"], equals: link.id } })),
              ],
            },
            orderBy: { occurredAt: "desc" },
            select: {
              targetId: true,
              occurredAt: true,
              metadata: true,
              actor: { select: { displayName: true } },
            },
          }),
          tx.user.findMany({
            where: { id: { in: [...new Set(uploadedBy)] } },
            select: { id: true, displayName: true },
          }),
        ]);
        const linkKey = (source: string | null, target: unknown, kind: unknown, at: Date) =>
          JSON.stringify([source, target, kind, at.toISOString()]);
        const linkedBy = new Map(
          linkAudit.map((event) => {
            const meta = event.metadata as {
              targetId?: string;
              kind?: string;
              linkId?: string;
            } | null;
            return [
              meta?.linkId ?? linkKey(event.targetId, meta?.targetId, meta?.kind, event.occurredAt),
              event.actor?.displayName ?? null,
            ];
          }),
        );
        const names = new Map(uploaders.map((user) => [user.id, user.displayName]));
        const activity = documents.flatMap((document) => [
          ...[...document.resource.sourceLinks, ...document.resource.targetLinks].map((link) => ({
            id: link.id,
            kind: "linked",
            title: document.title,
            filename: null,
            actorName:
              linkedBy.get(link.id) ??
              linkedBy.get(linkKey(link.sourceId, link.targetId, link.kind, link.createdAt)) ??
              null,
            occurredAt: link.createdAt.toISOString(),
            version: null,
          })),
          ...document.versions.map((version) => ({
            id: version.id,
            kind: "version",
            title: document.title,
            filename: version.filename,
            actorName: names.get(version.uploadedById ?? "") ?? null,
            occurredAt: version.createdAt.toISOString(),
            version: version.number,
          })),
        ]);
        activity.sort(
          (left, right) =>
            right.occurredAt.localeCompare(left.occurredAt) || left.id.localeCompare(right.id),
        );
        return {
          items: documents.map((document) => ({
            id: document.id,
            title: document.title,
            href: this.href("document", document.id),
            latestVersion: document.versions[0]?.number ?? null,
          })),
          activity: activity.slice(0, 100),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  href(kind: string, id: string) {
    return kind === "task"
      ? "/tasks/" + id
      : kind === "company"
        ? "/companies/" + id
        : kind === "document"
          ? "/document-workspace/" + id
          : kind === "interaction"
            ? "/interactions/" + id
            : "/feed/" + id;
  }
  async timeline(actor: string, id: string, q: RecordQuery) {
    await this.detail(actor, "company", id);
    const context = await this.authorization.context(actor),
      cursor = decodeCursor(q.cursor);
    const where: Prisma.BusinessEventWhereInput = {
      companyId: id,
      source: this.authorization.where(context),
      ...(q.from || q.to
        ? {
            occurredOn: {
              ...(q.from ? { gte: validDate(q.from) } : {}),
              ...(q.to ? { lte: validDate(q.to) } : {}),
            },
          }
        : {}),
    };
    const total = await this.database.client.businessEvent.count({ where });
    const rows = await this.database.client.businessEvent.findMany({
      where: {
        AND: [
          where,
          ...(cursor
            ? [
                {
                  OR: [
                    { occurredOn: { lt: cursor.createdAt } },
                    { occurredOn: cursor.createdAt, id: { lt: cursor.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      include: { source: { include: { business: true, task: true } } },
      orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
      take: q.limit + 1,
    });
    const items = rows.slice(0, q.limit).map((row) => ({
      id: row.id,
      type: row.type,
      title: row.source.business?.title ?? row.source.task?.title ?? "",
      occurredOn: row.occurredOn.toISOString().slice(0, 10),
      recordedAt: row.recordedAt.toISOString(),
      href: this.href(row.source.kind, row.sourceId),
      summary:
        row.type === "interaction"
          ? String((row.source.business?.data as Record<string, unknown>)?.discussion ?? "")
          : String((row.detail as Record<string, unknown>).reference ?? ""),
    }));
    return {
      items,
      total,
      nextCursor:
        rows.length > q.limit
          ? encodeCursor({ id: rows[q.limit - 1].id, createdAt: rows[q.limit - 1].occurredOn })
          : null,
    };
  }
}
