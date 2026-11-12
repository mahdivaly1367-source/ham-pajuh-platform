import { notifications } from "@/src/db/schema";

export type NotificationDraft = {
  recipientIds: Array<string | null | undefined>;
  actorId: string | null;
  projectId?: string | null;
  type: string;
  title: string;
  body?: string;
  href?: string;
};

export function buildNotificationRows(draft: NotificationDraft): Array<typeof notifications.$inferInsert> {
  const recipients = Array.from(new Set(draft.recipientIds.filter(
    (recipientId): recipientId is string => Boolean(recipientId) && recipientId !== draft.actorId
  )));

  return recipients.map((recipientId) => ({
    recipientId,
    actorId: draft.actorId,
    projectId: draft.projectId ?? null,
    type: draft.type,
    title: draft.title.slice(0, 180),
    body: (draft.body ?? "").slice(0, 4000),
    href: draft.href?.startsWith("/") && !draft.href.startsWith("//") ? draft.href.slice(0, 500) : "/dashboard"
  }));
}
