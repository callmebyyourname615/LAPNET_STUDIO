import type { Transaction } from "../identity/authorization.service";
export async function enqueueNotification(
  tx: Transaction,
  resourceId: string,
  recipients: string[],
  kind: string,
  eventKey: string,
  actor?: string,
) {
  for (const recipientId of new Set(recipients.filter((id) => id !== actor))) {
    const key = `${eventKey}:${recipientId}`;
    await tx.outboxJob.upsert({
      where: { key },
      create: { key, kind: "notify", resourceId, recipientId, payload: { notificationKind: kind } },
      update: {},
    });
  }
}
