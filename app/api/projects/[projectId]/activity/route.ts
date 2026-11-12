import { and, desc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { activityEvents, profiles, projectMembers, projects, user } from "@/src/db/schema";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const eventLabels: Record<string, string> = {
  "project.created": "پروژه ایجاد شد",
  "project.updated": "مشخصات پروژه به‌روزرسانی شد",
  "collaboration.requested": "درخواست همکاری ثبت شد",
  "collaboration.accepted": "درخواست همکاری پذیرفته شد",
  "collaboration.declined": "درخواست همکاری رد شد",
  "collaboration.withdrawn": "متقاضی درخواست همکاری خود را لغو کرد",
  "project.task_created": "وظیفه جدیدی به پروژه اضافه شد",
  "project.task_updated": "جزئیات یک وظیفه به‌روزرسانی شد",
  "project.task_status_changed": "وضعیت یک وظیفه تغییر کرد",
  "project.task_deleted": "یک وظیفه از پروژه حذف شد",
  "project.task_submitted_for_review": "یک وظیفه برای تأیید نهایی ارسال شد",
  "project.task_approved": "یک وظیفه پس از بررسی تأیید شد",
  "project.task_changes_requested": "برای یک وظیفه درخواست اصلاح ثبت شد",
  "project.discussion_created": "موضوع جدیدی برای گفت‌وگوی پژوهشی ثبت شد",
  "project.discussion_reply_created": "پاسخ تازه‌ای به گفت‌وگوی پروژه افزوده شد",
  "project.discussion_resolved": "یک گفت‌وگوی پروژه حل‌شده علامت‌گذاری شد",
  "project.discussion_reopened": "یک گفت‌وگوی پروژه دوباره باز شد",
  "project.member_role_changed": "نقش یکی از اعضای تیم تغییر کرد",
  "project.member_left": "یکی از اعضا از پروژه خارج شد",
  "project.member_removed": "یکی از اعضا از تیم خارج شد"
};

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  }

  try {
    const { projectId } = await context.params;
    if (!uuidPattern.test(projectId)) {
      return NextResponse.json({ error: "پروژه پیدا نشد." }, { status: 404 });
    }

    const db = getDb();
    const [project] = await db
      .select({ id: projects.id, visibility: projects.visibility, status: projects.status })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project || project.status === "archived") {
      return NextResponse.json({ error: "پروژه پیدا نشد." }, { status: 404 });
    }

    if (project.visibility === "private") {
      const session = await getAuth().api.getSession({ headers: request.headers });
      if (!session?.user?.id) {
        return NextResponse.json({ error: "پروژه پیدا نشد." }, { status: 404 });
      }

      const [membership] = await db
        .select({ id: projectMembers.id })
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, session.user.id)
        ))
        .limit(1);

      if (!membership) {
        return NextResponse.json({ error: "پروژه پیدا نشد." }, { status: 404 });
      }
    }

    const rows = await db
      .select({
        id: activityEvents.id,
        eventType: activityEvents.eventType,
        metadata: activityEvents.metadata,
        occurredAt: activityEvents.occurredAt,
        actorName: user.name,
        actorHandle: profiles.handle
      })
      .from(activityEvents)
      .leftJoin(user, eq(activityEvents.actorId, user.id))
      .leftJoin(profiles, and(
        eq(activityEvents.actorId, profiles.userId),
        eq(profiles.isPublic, true)
      ))
      .where(eq(activityEvents.projectId, projectId))
      .orderBy(desc(activityEvents.occurredAt))
      .limit(40);

    return NextResponse.json({
      events: rows.map((row) => ({
        id: row.id,
        eventType: row.eventType,
        message: eventLabels[row.eventType] ?? "فعالیت جدیدی ثبت شد",
        changes: row.eventType === "project.updated" ? Object.entries(
          (row.metadata?.changes && typeof row.metadata.changes === "object" ? row.metadata.changes : {}) as Record<string, { from?: unknown; to?: unknown }>
        ).map(([field, change]) => ({
          field,
          label: ({ title: "عنوان", summary: "خلاصه", visibility: "سطح دسترسی", status: "وضعیت", disciplineSlug: "حوزه علمی" } as Record<string, string>)[field] ?? field,
          from: typeof change?.from === "string" ? change.from : change?.from === null ? "—" : "",
          to: typeof change?.to === "string" ? change.to : change?.to === null ? "—" : ""
        })) : [],
        actorName: row.actorName ?? "سامانه",
        actorHandle: row.actorHandle,
        occurredAt: row.occurredAt.toISOString()
      }))
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/projects/[projectId]/activity failed:", error);
    return NextResponse.json({ error: "دریافت تاریخچه پروژه با خطا مواجه شد." }, { status: 500 });
  }
}
