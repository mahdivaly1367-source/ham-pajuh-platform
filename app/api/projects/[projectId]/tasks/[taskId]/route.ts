import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { activityEvents, notifications, projectMembers, projectTasks, projects } from "@/src/db/schema";
import { buildNotificationRows } from "@/lib/notifications";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "تاریخ مهلت معتبر نیست.");

const updateTaskInput = z.union([
  z.object({ action: z.literal("submit_for_review") }).strict(),
  z.object({ action: z.literal("approve"), comment: z.string().trim().max(2000).optional() }).strict(),
  z.object({ action: z.literal("request_changes"), comment: z.string().trim().min(3).max(2000) }).strict(),
  z.object({
    title: z.string().trim().min(3).max(180).optional(),
    description: z.string().trim().max(5000).optional(),
    status: z.enum(["todo", "in_progress", "blocked"]).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    assigneeId: z.string().max(128).nullable().optional(),
    dueDate: z.union([dateOnly, z.null()]).optional()
  }).strict().refine((value) => Object.keys(value).length > 0, {
    message: "دست‌کم یک فیلد برای تغییر انتخاب کنید."
  })
]);

function dueDateToTimestamp(value: string | null) {
  return value ? new Date(value + "T23:59:59.999Z") : null;
}

async function getMembership(projectId: string, userId: string) {
  const db = getDb();
  const [membership] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return membership ?? null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; taskId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  }

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "برای ویرایش وظیفه وارد حساب کاربری شوید." }, { status: 401 });
    }

    const { projectId, taskId } = await context.params;
    if (!uuidPattern.test(projectId) || !uuidPattern.test(taskId)) {
      return NextResponse.json({ error: "وظیفه پیدا نشد." }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بدنه درخواست JSON معتبر نیست." }, { status: 400 });
    }

    const parsed = updateTaskInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "اطلاعات تغییر وظیفه معتبر نیست." }, { status: 400 });
    }

    const db = getDb();
    const membership = await getMembership(projectId, session.user.id);
    if (!membership) {
      return NextResponse.json({ error: "تابلوی وظایف فقط برای اعضای پروژه در دسترس است." }, { status: 404 });
    }

    const [task] = await db.select()
      .from(projectTasks)
      .where(and(eq(projectTasks.id, taskId), eq(projectTasks.projectId, projectId)))
      .limit(1);
    if (!task) {
      return NextResponse.json({ error: "وظیفه پیدا نشد." }, { status: 404 });
    }

    const actorId = session.user.id;
    const isManager = membership.role === "owner" || membership.role === "maintainer";
    const isTaskParticipant = task.createdBy === actorId || task.assigneeId === actorId;
    const now = new Date();

    if ("action" in parsed.data) {
      const action = parsed.data.action;

      if (action === "submit_for_review") {
        if (membership.role === "viewer" || !isTaskParticipant) {
          return NextResponse.json({ error: "فقط مسئول یا ایجادکننده وظیفه می‌تواند آن را برای بررسی ارسال کند." }, { status: 403 });
        }
        if (!["todo", "in_progress", "blocked", "changes_requested"].includes(task.status)) {
          return NextResponse.json({ error: "این وظیفه در وضعیت فعلی قابل ارسال برای بررسی نیست." }, { status: 409 });
        }

        const updated = await db.transaction(async (tx) => {
          const [result] = await tx.update(projectTasks).set({
            status: "in_review",
            reviewRequestedAt: now,
            reviewSubmittedBy: actorId,
            reviewedAt: null,
            reviewedBy: null,
            reviewComment: "",
            completedAt: null,
            updatedAt: now
          }).where(and(
            eq(projectTasks.id, taskId),
            eq(projectTasks.projectId, projectId),
            eq(projectTasks.status, task.status)
          )).returning();

          if (!result) return null;
          await tx.insert(activityEvents).values({
            projectId,
            actorId,
            eventType: "project.task_submitted_for_review",
            metadata: { taskId, title: task.title }
          });

          const managers = await tx.select({ userId: projectMembers.userId }).from(projectMembers)
            .where(and(
              eq(projectMembers.projectId, projectId),
              inArray(projectMembers.role, ["owner", "maintainer"])
            ));
          const [project] = await tx.select({ slug: projects.slug }).from(projects)
            .where(eq(projects.id, projectId)).limit(1);
          const rows = buildNotificationRows({
            recipientIds: managers.map((member) => member.userId),
            actorId,
            projectId,
            type: "task_review_requested",
            title: "وظیفه‌ای برای تأیید ارسال شد",
            body: task.title,
            href: project ? "/projects/" + encodeURIComponent(project.slug) : "/dashboard"
          });
          if (rows.length) await tx.insert(notifications).values(rows);
          return result;
        });
        if (!updated) {
          return NextResponse.json({ error: "وضعیت وظیفه هم‌زمان تغییر کرده است؛ دوباره بارگذاری کنید." }, { status: 409 });
        }
        return NextResponse.json({ task: updated });
      }

      if (!isManager) {
        return NextResponse.json({ error: "فقط مدیران پروژه می‌توانند نتیجه بررسی را ثبت کنند." }, { status: 403 });
      }
      if (task.status !== "in_review") {
        return NextResponse.json({ error: "این وظیفه در صف بررسی قرار ندارد." }, { status: 409 });
      }
      if (task.reviewSubmittedBy === actorId) {
        return NextResponse.json({ error: "برای جلوگیری از تأیید خودکار، ارسال‌کننده نمی‌تواند بررسی‌کننده همان مرحله باشد." }, { status: 403 });
      }

      const comment = "comment" in parsed.data ? (parsed.data.comment ?? "") : "";
      const approved = action === "approve";
      const updated = await db.transaction(async (tx) => {
        const [result] = await tx.update(projectTasks).set({
          status: approved ? "done" : "changes_requested",
          reviewedAt: now,
          reviewedBy: actorId,
          reviewComment: comment,
          completedAt: approved ? now : null,
          updatedAt: now
        }).where(and(
          eq(projectTasks.id, taskId),
          eq(projectTasks.projectId, projectId),
          eq(projectTasks.status, "in_review")
        )).returning();

        if (!result) return null;
        await tx.insert(activityEvents).values({
          projectId,
          actorId,
          eventType: approved ? "project.task_approved" : "project.task_changes_requested",
          metadata: { taskId, title: task.title, comment }
        });

        const [project] = await tx.select({ slug: projects.slug }).from(projects)
          .where(eq(projects.id, projectId)).limit(1);
        const rows = buildNotificationRows({
          recipientIds: [task.reviewSubmittedBy, task.createdBy, task.assigneeId],
          actorId,
          projectId,
          type: approved ? "task_review_approved" : "task_review_changes_requested",
          title: approved ? "وظیفه شما تأیید شد" : "برای وظیفه شما اصلاح خواسته شده است",
          body: comment || task.title,
          href: project ? "/projects/" + encodeURIComponent(project.slug) : "/dashboard"
        });
        if (rows.length) await tx.insert(notifications).values(rows);
        return result;
      });
      if (!updated) {
        return NextResponse.json({ error: "این وظیفه قبلاً بررسی شده یا وضعیت آن تغییر کرده است." }, { status: 409 });
      }
      return NextResponse.json({ task: updated });
    }

    const changes = parsed.data;
    const statusOnly = Object.keys(changes).length === 1 && changes.status !== undefined;
    if (!isManager && !(membership.role === "contributor" && statusOnly && isTaskParticipant)) {
      return NextResponse.json({
        error: "مشارکت‌کنندگان فقط می‌توانند وضعیت وظیفه‌ای را که ایجاد کرده‌اند یا مسئول آن هستند تغییر دهند."
      }, { status: 403 });
    }

    if (changes.status !== undefined && task.status === "in_review") {
      return NextResponse.json({ error: "تا پایان بررسی مدیران، وضعیت این وظیفه قابل تغییر نیست." }, { status: 409 });
    }
    if (changes.status !== undefined && task.status === "done" && !isManager) {
      return NextResponse.json({ error: "وظیفه تأییدشده فقط توسط مدیر پروژه قابل بازگشایی است." }, { status: 403 });
    }

    if (changes.assigneeId) {
      const [assignee] = await db.select({ role: projectMembers.role })
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, changes.assigneeId)
        ))
        .limit(1);
      if (!assignee || assignee.role === "viewer") {
        return NextResponse.json({ error: "مسئول انتخاب‌شده عضو فعال تیم پروژه نیست." }, { status: 400 });
      }
    }

    const updateValues = {
      ...(changes.title !== undefined ? { title: changes.title } : {}),
      ...(changes.description !== undefined ? { description: changes.description } : {}),
      ...(changes.status !== undefined ? { status: changes.status, completedAt: null } : {}),
      ...(changes.priority !== undefined ? { priority: changes.priority } : {}),
      ...(changes.assigneeId !== undefined ? { assigneeId: changes.assigneeId } : {}),
      ...(changes.dueDate !== undefined ? { dueAt: dueDateToTimestamp(changes.dueDate) } : {}),
      updatedAt: now
    };

    const updated = await db.transaction(async (tx) => {
      const [result] = await tx.update(projectTasks)
        .set(updateValues)
        .where(and(
          eq(projectTasks.id, taskId),
          eq(projectTasks.projectId, projectId),
          eq(projectTasks.status, task.status)
        ))
        .returning();
      if (!result) return null;

      const eventType = changes.status !== undefined && changes.status !== task.status
        ? "project.task_status_changed"
        : "project.task_updated";

      await tx.insert(activityEvents).values({
        projectId,
        actorId,
        eventType,
        metadata: { taskId, title: result.title, changedFields: Object.keys(changes) }
      });

      if (changes.assigneeId && changes.assigneeId !== task.assigneeId) {
        const [project] = await tx.select({ slug: projects.slug }).from(projects)
          .where(eq(projects.id, projectId)).limit(1);
        const rows = buildNotificationRows({
          recipientIds: [changes.assigneeId],
          actorId,
          projectId,
          type: "task_assigned",
          title: "وظیفه تازه به شما واگذار شد",
          body: result.title,
          href: project ? "/projects/" + encodeURIComponent(project.slug) : "/dashboard"
        });
        if (rows.length) await tx.insert(notifications).values(rows);
      }
      return result;
    });

    if (!updated) {
      return NextResponse.json({ error: "وضعیت وظیفه تغییر کرده است؛ دوباره بارگذاری کنید." }, { status: 409 });
    }
    return NextResponse.json({ task: updated });
  } catch (error) {
    console.error("PATCH /api/projects/[projectId]/tasks/[taskId] failed:", error);
    return NextResponse.json({ error: "به‌روزرسانی وظیفه انجام نشد." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string; taskId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  }

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "برای حذف وظیفه وارد حساب کاربری شوید." }, { status: 401 });
    }

    const { projectId, taskId } = await context.params;
    if (!uuidPattern.test(projectId) || !uuidPattern.test(taskId)) {
      return NextResponse.json({ error: "وظیفه پیدا نشد." }, { status: 404 });
    }

    const membership = await getMembership(projectId, session.user.id);
    if (!membership || !["owner", "maintainer"].includes(membership.role)) {
      return NextResponse.json({ error: "فقط مدیران پروژه می‌توانند وظیفه را حذف کنند." }, { status: 403 });
    }

    const db = getDb();
    const outcome = await db.transaction(async (tx) => {
      const [task] = await tx.select({ title: projectTasks.title })
        .from(projectTasks)
        .where(and(eq(projectTasks.id, taskId), eq(projectTasks.projectId, projectId)))
        .limit(1);
      if (!task) return "not_found" as const;

      const [deleted] = await tx.delete(projectTasks)
        .where(and(eq(projectTasks.id, taskId), eq(projectTasks.projectId, projectId)))
        .returning({ id: projectTasks.id });
      if (!deleted) return "not_found" as const;

      await tx.insert(activityEvents).values({
        projectId,
        actorId: session.user.id,
        eventType: "project.task_deleted",
        metadata: { taskId, title: task.title }
      });
      return "deleted" as const;
    });

    if (outcome === "not_found") {
      return NextResponse.json({ error: "وظیفه پیدا نشد." }, { status: 404 });
    }
    return NextResponse.json({ message: "وظیفه حذف شد." });
  } catch (error) {
    console.error("DELETE /api/projects/[projectId]/tasks/[taskId] failed:", error);
    return NextResponse.json({ error: "حذف وظیفه انجام نشد." }, { status: 500 });
  }
}
