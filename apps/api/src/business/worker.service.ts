import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import type { Prisma } from "@lapnet/database";
import { BusinessService } from "./business.service";
import { FilesService } from "./files.service";
import { enqueueNotification } from "./events";
import { businessDate } from "../tasks/tasks.service";

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private active: Promise<void> | null = null;
  private lastReminder = 0;
  constructor(
    private readonly business: BusinessService,
    private readonly files: FilesService,
  ) {}
  onModuleInit() {
    if (process.env.PORTAL_WORKER === "1") {
      this.timer = setInterval(() => this.start(), 1000);
      this.start();
    }
  }
  private start() {
    if (!this.active)
      this.active = this.tick()
        .catch(() => {})
        .finally(() => {
          this.active = null;
        });
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.active;
  }
  async tick() {
    if (Date.now() - this.lastReminder > 60000) {
      await this.reminders();
      this.lastReminder = Date.now();
    }
    for (let i = 0; i < 10; i++) if (!(await this.one())) break;
  }
  async one() {
    const db = this.business.database.client;
    const ids = await db.$queryRaw<
      { id: string }[]
    >`UPDATE outbox_jobs SET status='processing',attempts=attempts+1,lease_until=now()+interval '90 seconds' WHERE id=(SELECT id FROM outbox_jobs WHERE (status='pending' AND available_at<=now()) OR (status='processing' AND lease_until<now()) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`;
    if (!ids.length) return false;
    const job = await db.outboxJob.findUniqueOrThrow({ where: { id: ids[0].id } });
    try {
      if (job.kind === "scan")
        await this.files.process(String((job.payload as Prisma.JsonObject).versionId));
      else if (job.kind === "notify" && job.resourceId && job.recipientId) {
        await db.$transaction(async (tx) => {
          const user = await tx.user.findFirst({
            where: { id: job.recipientId!, status: "active" },
          });
          if (!user) return;
          const context = await this.business.authorization.context(user.id, tx);
          const resource = await tx.resource.findFirst({
            where: { id: job.resourceId!, AND: [this.business.authorization.where(context)] },
          });
          if (!resource) return;
          await tx.notification.upsert({
            where: { key: job.key },
            create: {
              key: job.key,
              resourceId: resource.id,
              recipientId: user.id,
              kind: String((job.payload as Prisma.JsonObject).notificationKind),
            },
            update: {},
          });
        });
      } else throw new Error("UNKNOWN_JOB");
      await db.outboxJob.updateMany({
        where: { id: job.id, status: "processing", attempts: job.attempts },
        data: { status: "done", leaseUntil: null, errorCode: null },
      });
    } catch (error) {
      const code =
        error instanceof Error && /^(SCANNER_|FILE_|UNKNOWN_JOB)/.test(error.message)
          ? error.message
          : "PROCESSING_FAILED";
      await db.outboxJob.updateMany({
        where: { id: job.id, status: "processing", attempts: job.attempts },
        data: {
          status: job.attempts >= 5 ? "failed" : "pending",
          leaseUntil: null,
          errorCode: code,
          availableAt: new Date(Date.now() + Math.min(3600000, 10000 * 2 ** job.attempts)),
        },
      });
    }
    return true;
  }
  async reminders() {
    const db = this.business.database.client,
      today = businessDate();
    const rows = await db.task.findMany({
      where: {
        resource: { archivedAt: null },
        status: { notIn: ["done", "cancelled"] },
        dueDate: { lte: new Date(today + "T00:00:00Z") },
      },
      include: { collaborators: { select: { userId: true } } },
      orderBy: { id: "asc" },
    });
    for (const task of rows)
      await db.$transaction((tx) =>
        enqueueNotification(
          tx,
          task.id,
          [task.assigneeId, ...task.collaborators.map((x) => x.userId)],
          task.dueDate!.toISOString().slice(0, 10) === today ? "due_today" : "overdue",
          `reminder:${task.id}:${today}`,
        ),
      );
  }
}
