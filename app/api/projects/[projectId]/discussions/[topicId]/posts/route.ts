import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { activityEvents, notifications, profiles, projectDiscussionPosts, projectDiscussionTopics, projectMembers, projects, user } from "@/src/db/schema";
import { buildNotificationRows } from "@/lib/notifications";

export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const createPostInput = z.object({ body: z.string().trim().min(2, "پاسخ باید دست‌کم ۲ نویسه باشد.").max(10000) }).strict();

export async function GET(request: Request, context: { params: Promise<{ projectId: string; topicId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) return NextResponse.json({ error: "برای مشاهده پاسخ‌ها وارد حساب کاربری شوید." }, { status: 401 });
    const { projectId, topicId } = await context.params;
    if (!uuidPattern.test(projectId) || !uuidPattern.test(topicId)) return NextResponse.json({ error: "گفت‌وگو پیدا نشد." }, { status: 404 });
    const db = getDb();
    const [membership] = await db.select({ id: projectMembers.id }).from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, session.user.id))).limit(1);
    if (!membership) return NextResponse.json({ error: "گفت‌وگو پیدا نشد." }, { status: 404 });
    const [topic] = await db.select({ id: projectDiscussionTopics.id }).from(projectDiscussionTopics)
      .where(and(eq(projectDiscussionTopics.id, topicId), eq(projectDiscussionTopics.projectId, projectId))).limit(1);
    if (!topic) return NextResponse.json({ error: "گفت‌وگو پیدا نشد." }, { status: 404 });

    const posts = await db.select({
      id: projectDiscussionPosts.id,
      body: projectDiscussionPosts.body,
      authorId: projectDiscussionPosts.authorId,
      createdAt: projectDiscussionPosts.createdAt,
      editedAt: projectDiscussionPosts.editedAt,
      authorName: user.name,
      authorHandle: profiles.handle
    }).from(projectDiscussionPosts)
      .innerJoin(user, eq(projectDiscussionPosts.authorId, user.id))
      .leftJoin(profiles, and(eq(profiles.userId, projectDiscussionPosts.authorId), eq(profiles.isPublic, true)))
      .where(eq(projectDiscussionPosts.topicId, topicId))
      .orderBy(asc(projectDiscussionPosts.createdAt))
      .limit(300);
    return NextResponse.json({ posts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET discussion posts failed:", error);
    return NextResponse.json({ error: "دریافت پاسخ‌های بحث انجام نشد." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string; topicId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) return NextResponse.json({ error: "برای پاسخ‌دادن وارد حساب کاربری شوید." }, { status: 401 });
    const { projectId, topicId } = await context.params;
    if (!uuidPattern.test(projectId) || !uuidPattern.test(topicId)) return NextResponse.json({ error: "گفت‌وگو پیدا نشد." }, { status: 404 });
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "بدنه درخواست JSON معتبر نیست." }, { status: 400 }); }
    const parsed = createPostInput.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "متن پاسخ معتبر نیست." }, { status: 400 });

    const db = getDb();
    const [membership] = await db.select({ role: projectMembers.role }).from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, session.user.id))).limit(1);
    if (!membership) return NextResponse.json({ error: "گفت‌وگو پیدا نشد." }, { status: 404 });
    if (membership.role === "viewer") return NextResponse.json({ error: "نقش مشاهده‌گر فقط اجازه خواندن گفت‌وگوها را دارد." }, { status: 403 });
    const [topic] = await db.select({
      id: projectDiscussionTopics.id, title: projectDiscussionTopics.title, status: projectDiscussionTopics.status, authorId: projectDiscussionTopics.authorId
    }).from(projectDiscussionTopics)
      .where(and(eq(projectDiscussionTopics.id, topicId), eq(projectDiscussionTopics.projectId, projectId))).limit(1);
    if (!topic) return NextResponse.json({ error: "گفت‌وگو پیدا نشد." }, { status: 404 });
    if (topic.status === "resolved") return NextResponse.json({ error: "این بحث بسته شده است؛ برای ادامه ابتدا آن را دوباره باز کنید." }, { status: 409 });

    const created = await db.transaction(async (tx) => {
      const now = new Date();
      const [post] = await tx.insert(projectDiscussionPosts).values({
        topicId, authorId: session.user.id, body: parsed.data.body, createdAt: now, updatedAt: now
      }).returning();
      await tx.update(projectDiscussionTopics).set({ updatedAt: now }).where(eq(projectDiscussionTopics.id, topicId));
      await tx.insert(activityEvents).values({
        projectId, actorId: session.user.id, eventType: "project.discussion_reply_created",
        metadata: { topicId, title: topic.title, postId: post.id }
      });
      const [authorMembership] = await tx.select({ userId: projectMembers.userId }).from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, topic.authorId)
        )).limit(1);
      const [project] = await tx.select({ slug: projects.slug }).from(projects)
        .where(eq(projects.id, projectId)).limit(1);
      const rows = buildNotificationRows({
        recipientIds: authorMembership ? [topic.authorId] : [],
        actorId: session.user.id,
        projectId,
        type: "discussion_reply",
        title: "پاسخ تازه به گفت‌وگوی شما",
        body: topic.title,
        href: project ? "/projects/" + encodeURIComponent(project.slug) : "/dashboard"
      });
      if (rows.length) await tx.insert(notifications).values(rows);
      return post;
    });
    return NextResponse.json({
      post: { ...created, authorName: session.user.name, authorHandle: null }
    }, { status: 201 });
  } catch (error) {
    console.error("POST discussion post failed:", error);
    return NextResponse.json({ error: "ثبت پاسخ انجام نشد." }, { status: 500 });
  }
}
