import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { activityEvents, profiles, projectDiscussionPosts, projectDiscussionTopics, projectMembers, projectTasks, user } from "@/src/db/schema";

export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const createTopicInput = z.object({
  title: z.string().trim().min(5, "عنوان بحث باید دست‌کم ۵ نویسه باشد.").max(180),
  body: z.string().trim().min(10, "متن بحث باید دست‌کم ۱۰ نویسه باشد.").max(12000),
  kind: z.enum(["general", "question", "decision", "review"]).default("general"),
  taskId: z.string().uuid().nullable().optional()
}).strict();

async function getMembership(projectId: string, userId: string) {
  const [membership] = await getDb().select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return membership ?? null;
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) return NextResponse.json({ error: "برای مشاهده گفت‌وگوهای پروژه وارد حساب کاربری شوید." }, { status: 401 });
    const { projectId } = await context.params;
    if (!uuidPattern.test(projectId)) return NextResponse.json({ error: "پروژه پیدا نشد." }, { status: 404 });
    const db = getDb();
    const membership = await getMembership(projectId, session.user.id);
    if (!membership) return NextResponse.json({ error: "گفت‌وگوهای این پروژه فقط برای اعضای تیم در دسترس است." }, { status: 404 });

    const [topics, tasks] = await Promise.all([
      db.select({
        id: projectDiscussionTopics.id,
        taskId: projectDiscussionTopics.taskId,
        authorId: projectDiscussionTopics.authorId,
        kind: projectDiscussionTopics.kind,
        title: projectDiscussionTopics.title,
        body: projectDiscussionTopics.body,
        status: projectDiscussionTopics.status,
        resolvedAt: projectDiscussionTopics.resolvedAt,
        createdAt: projectDiscussionTopics.createdAt,
        updatedAt: projectDiscussionTopics.updatedAt,
        authorName: user.name,
        authorHandle: profiles.handle,
        taskTitle: projectTasks.title
      }).from(projectDiscussionTopics)
        .innerJoin(user, eq(projectDiscussionTopics.authorId, user.id))
        .leftJoin(profiles, and(eq(profiles.userId, projectDiscussionTopics.authorId), eq(profiles.isPublic, true)))
        .leftJoin(projectTasks, eq(projectDiscussionTopics.taskId, projectTasks.id))
        .where(eq(projectDiscussionTopics.projectId, projectId))
        .orderBy(desc(projectDiscussionTopics.updatedAt), desc(projectDiscussionTopics.createdAt))
        .limit(60),
      db.select({ id: projectTasks.id, title: projectTasks.title })
        .from(projectTasks).where(eq(projectTasks.projectId, projectId))
        .orderBy(desc(projectTasks.createdAt)).limit(100)
    ]);

    const topicIds = topics.map((topic) => topic.id);
    const counts = topicIds.length ? await db.select({
      topicId: projectDiscussionPosts.topicId,
      replyCount: sql<number>`count(*)::int`,
      latestReplyAt: sql<Date | null>`max(${projectDiscussionPosts.createdAt})`
    }).from(projectDiscussionPosts)
      .where(inArray(projectDiscussionPosts.topicId, topicIds))
      .groupBy(projectDiscussionPosts.topicId) : [];
    const countByTopic = new Map(counts.map((item) => [item.topicId, item]));
    const isManager = membership.role === "owner" || membership.role === "maintainer";

    return NextResponse.json({
      topics: topics.map((topic) => {
        const count = countByTopic.get(topic.id);
        return {
          ...topic,
          replyCount: count?.replyCount ?? 0,
          latestReplyAt: count?.latestReplyAt?.toISOString() ?? null,
          isAuthor: topic.authorId === session.user.id,
          canResolve: isManager || topic.authorId === session.user.id
        };
      }),
      tasks,
      access: { role: membership.role, currentUserId: session.user.id, canWrite: membership.role !== "viewer" }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/projects/[projectId]/discussions failed:", error);
    return NextResponse.json({ error: "دریافت گفت‌وگوهای پروژه با خطا مواجه شد." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) return NextResponse.json({ error: "برای ایجاد بحث وارد حساب کاربری شوید." }, { status: 401 });
    const { projectId } = await context.params;
    if (!uuidPattern.test(projectId)) return NextResponse.json({ error: "پروژه پیدا نشد." }, { status: 404 });
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "بدنه درخواست JSON معتبر نیست." }, { status: 400 }); }
    const parsed = createTopicInput.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "اطلاعات بحث معتبر نیست.", details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const db = getDb();
    const membership = await getMembership(projectId, session.user.id);
    if (!membership) return NextResponse.json({ error: "گفت‌وگوهای این پروژه فقط برای اعضای تیم در دسترس است." }, { status: 404 });
    if (membership.role === "viewer") return NextResponse.json({ error: "نقش مشاهده‌گر اجازه ایجاد بحث یا پاسخ را ندارد." }, { status: 403 });

    if (parsed.data.taskId) {
      const [task] = await db.select({ id: projectTasks.id }).from(projectTasks)
        .where(and(eq(projectTasks.id, parsed.data.taskId), eq(projectTasks.projectId, projectId))).limit(1);
      if (!task) return NextResponse.json({ error: "وظیفه پیوندشده متعلق به این پروژه نیست." }, { status: 400 });
    }

    const created = await db.transaction(async (tx) => {
      const [topic] = await tx.insert(projectDiscussionTopics).values({
        projectId, taskId: parsed.data.taskId ?? null, authorId: session.user.id,
        kind: parsed.data.kind, title: parsed.data.title, body: parsed.data.body
      }).returning();
      await tx.insert(activityEvents).values({
        projectId, actorId: session.user.id, eventType: "project.discussion_created",
        metadata: { topicId: topic.id, title: topic.title, kind: topic.kind, taskId: topic.taskId }
      });
      return topic;
    });
    return NextResponse.json({ topic: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects/[projectId]/discussions failed:", error);
    return NextResponse.json({ error: "ایجاد گفت‌وگوی جدید انجام نشد." }, { status: 500 });
  }
}
