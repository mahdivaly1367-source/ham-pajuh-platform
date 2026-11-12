import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { activityEvents, projectDiscussionTopics, projectMembers } from "@/src/db/schema";

export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actionInput = z.object({ action: z.enum(["resolve", "reopen"]) }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string; topicId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) return NextResponse.json({ error: "برای تغییر وضعیت بحث وارد حساب کاربری شوید." }, { status: 401 });
    const { projectId, topicId } = await context.params;
    if (!uuidPattern.test(projectId) || !uuidPattern.test(topicId)) return NextResponse.json({ error: "گفت‌وگو پیدا نشد." }, { status: 404 });
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "بدنه درخواست JSON معتبر نیست." }, { status: 400 }); }
    const parsed = actionInput.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "عملیات انتخاب‌شده معتبر نیست." }, { status: 400 });

    const db = getDb();
    const [membership] = await db.select({ role: projectMembers.role }).from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, session.user.id))).limit(1);
    if (!membership) return NextResponse.json({ error: "گفت‌وگو پیدا نشد." }, { status: 404 });
    const [topic] = await db.select().from(projectDiscussionTopics)
      .where(and(eq(projectDiscussionTopics.id, topicId), eq(projectDiscussionTopics.projectId, projectId))).limit(1);
    if (!topic) return NextResponse.json({ error: "گفت‌وگو پیدا نشد." }, { status: 404 });

    const manager = membership.role === "owner" || membership.role === "maintainer";
    if (membership.role === "viewer" || (!manager && topic.authorId !== session.user.id)) {
      return NextResponse.json({ error: "فقط نویسنده بحث یا مدیر پروژه می‌تواند وضعیت آن را تغییر دهد." }, { status: 403 });
    }
    const nextStatus = parsed.data.action === "resolve" ? "resolved" : "open";
    if (topic.status === nextStatus) return NextResponse.json({ topic, message: "وضعیت بحث تغییری نکرد." });

    const now = new Date();
    const updated = await db.transaction(async (tx) => {
      const [result] = await tx.update(projectDiscussionTopics).set({
        status: nextStatus,
        resolvedBy: nextStatus === "resolved" ? session.user.id : null,
        resolvedAt: nextStatus === "resolved" ? now : null,
        updatedAt: now
      }).where(and(eq(projectDiscussionTopics.id, topicId), eq(projectDiscussionTopics.projectId, projectId))).returning();
      if (!result) return null;
      await tx.insert(activityEvents).values({
        projectId, actorId: session.user.id,
        eventType: nextStatus === "resolved" ? "project.discussion_resolved" : "project.discussion_reopened",
        metadata: { topicId, title: topic.title }
      });
      return result;
    });
    if (!updated) return NextResponse.json({ error: "گفت‌وگو پیدا نشد." }, { status: 404 });
    return NextResponse.json({ topic: updated, message: nextStatus === "resolved" ? "بحث به‌عنوان حل‌شده ثبت شد." : "بحث دوباره باز شد." });
  } catch (error) {
    console.error("PATCH /api/projects/[projectId]/discussions/[topicId] failed:", error);
    return NextResponse.json({ error: "تغییر وضعیت گفت‌وگو انجام نشد." }, { status: 500 });
  }
}
