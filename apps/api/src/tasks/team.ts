import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { Transaction } from "../identity/authorization.service";
import { current } from "../identity/authorization.service";

export type TaskTeamInput = {
  assigneeId: string;
  collaboratorIds: string[];
  taggedDepartmentIds?: string[];
};
export const teamInclude = {
  taggedDepartments: {
    include: { department: { select: { id: true, code: true, name: true, active: true } } },
  },
} as const;
export async function syncTaskTeam(
  tx: Transaction,
  host: string,
  taskId: string,
  input: TaskTeamInput,
) {
  const resource = await tx.resource.findUniqueOrThrow({ where: { id: taskId } });
  if (resource.ownerUserId !== host) throw new ForbiddenException();
  if (input.collaboratorIds.includes(input.assigneeId)) throw new BadRequestException();
  const users = [...new Set([input.assigneeId, ...input.collaboratorIds])];
  const departments = [...new Set(input.taggedDepartmentIds ?? [])];
  if (users.length > 26 || departments.length > 25) throw new BadRequestException();
  if (
    (await tx.user.count({
      where: { id: { in: users }, status: "active", username: { not: null } },
    })) !== users.length ||
    (await tx.department.count({ where: { id: { in: departments }, active: true } })) !==
      departments.length
  )
    throw new BadRequestException();
  await tx.resourceGrant.updateMany({
    where: {
      resourceId: taskId,
      source: "task_team",
      revokedAt: null,
      OR: [
        { userId: { not: null, notIn: users } },
        { departmentId: { not: null, notIn: departments } },
      ],
    },
    data: { revokedAt: new Date() },
  });
  for (const subject of [
    ...users.filter((id) => id !== host).map((userId) => ({ userId })),
    ...departments.map((departmentId) => ({ departmentId })),
  ]) {
    for (const permission of ["view", "comment", "edit"] as const) {
      if (
        !(await tx.resourceGrant.findFirst({
          where: {
            resourceId: taskId,
            ...subject,
            permission,
            source: "task_team",
            revokedAt: null,
          },
          select: { id: true },
        }))
      )
        await tx.resourceGrant.create({
          data: {
            resourceId: taskId,
            ...subject,
            permission,
            source: "task_team",
            grantedById: host,
          },
        });
    }
  }
}

export async function taskTeamRecipients(
  tx: Transaction,
  row: {
    id: string;
    assigneeId: string;
    resource: { ownerUserId: string };
    collaborators: { user: { id: string } }[];
    taggedDepartments?: { department: { id: string } }[];
  },
) {
  const memberships = await tx.departmentMembership.findMany({
    where: {
      departmentId: { in: row.taggedDepartments?.map((x) => x.department.id) ?? [] },
      ...current(),
      department: { active: true },
      user: { status: "active" },
    },
    select: { userId: true },
  });
  return [
    ...new Set([
      row.resource.ownerUserId,
      row.assigneeId,
      ...row.collaborators.map((x) => x.user.id),
      ...memberships.map((x) => x.userId),
    ]),
  ];
}
