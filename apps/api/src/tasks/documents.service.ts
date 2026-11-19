import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PortalRequest } from "../http";
import { BusinessService } from "../business/business.service";
import { FilesService } from "../business/files.service";
import { businessDate } from "./tasks.service";

@Injectable()
export class TaskDocumentsService {
  constructor(
    private readonly business: BusinessService,
    private readonly files: FilesService,
  ) {}
  async upload(actor: string, taskId: string, request: PortalRequest) {
    const before = await this.business.authorization.requireResource(actor, taskId, "view");
    if (before.kind !== "task") throw new NotFoundException();
    const title = this.files.decodeHeader(request, "x-document-title", 200).trim();
    const note = this.files.decodeHeader(request, "x-version-note", 500).trim();
    return this.files.receive(request, async (tx, file) => {
      await tx.$queryRaw`SELECT id FROM resources WHERE id=${taskId}::uuid FOR UPDATE`;
      const task = await this.business.authorization.requireResource(actor, taskId, "view", tx);
      if (task.kind !== "task") throw new NotFoundException();
      const id = randomUUID();
      await tx.resource.create({
        data: {
          id,
          kind: "document",
          ownerUserId: actor,
          ownerDepartmentId: task.ownerDepartmentId,
        },
      });
      await tx.businessRecord.create({
        data: {
          id,
          parentId: taskId,
          title: title || file.filename,
          data: {
            direction: "internal",
            issueDate: businessDate(),
            externalNumber: "",
            description: note,
            tags: [],
          },
        },
      });
      await tx.documentMetadata.create({
        data: { documentId: id, departmentId: task.ownerDepartmentId },
      });
      const version = await this.files.persist(tx, actor, id, file, note);
      const link = await tx.recordLink.create({
        data: { sourceId: taskId, targetId: id, kind: "attachment" },
      });
      await this.business.authorization.audit(
        tx,
        actor,
        "resource.linked",
        taskId,
        request.requestId,
        { linkId: link.id, targetId: id, kind: "attachment" },
      );
      const selectPerson = { id: true, displayName: true, status: true } as const;
      const row = await tx.businessRecord.findUniqueOrThrow({
        where: { id },
        include: {
          parent: true,
          resource: {
            include: {
              owner: { select: selectPerson },
              department: { select: { id: true, code: true, name: true } },
            },
          },
        },
      });
      await this.business.saveRevision(tx, row, actor, "task_uploaded", request.requestId);
      return { id, title: title || file.filename, version };
    });
  }
}
