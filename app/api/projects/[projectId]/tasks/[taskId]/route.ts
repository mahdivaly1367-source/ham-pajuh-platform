import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { activityEvents, projectMembers, projectTasks } from "@/src/db/schema";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "تاریخ مهلت معتبر نیست.");

const updateTaskInput = z.object({
  title: z.string().trim().min(3).max(180).optional(),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assigneeId: z.string().max(128).nullable().optional(),
  dueDate: z.union([dateOnly, z.null()]).optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "دست‌کم یک فیلد برای تغییر انتخاب کنید."
});

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

    const isManager = membership.role === "owner" || membership.role === "maintainer";
    const statusOnly = Object.keys(parsed.data).length === 1 && parsed.data.status !== undefined;
    const isTaskParticipant = task.createdBy === session.user.id || task.assigneeId === session.user.id;
    if (!isManager && !(membership.role === "contributor" && statusOnly && isTaskParticipant)) {
      return NextResponse.json({
        error: "اعضای عادی فقط می‌توانند وضعیت وظیفه‌ای را تغییر دهند که ایجاد کرده‌اند یا مسئول آن هستند."
      }, { status: 403 });
    }

    if (parsed.data.assigneeId) {
      const [assignee] = await db.select({ role: projectMembers.role })
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, parsed.data.assigneeId)
        ))
        .limit(1);
      if (!assignee || assignee.role === "viewer") {
        return NextResponse.json({ error: "مسئول انتخاب‌شده عضو فعال تیم پروژه نیست." }, { status: 400 });
      }
    }

    const now = new Date();
    const updateValues = {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.status !== undefined ? {
        status: parsed.data.status,
        completedAt: parsed.data.status === "done" ? (task.completedAt ?? now) : null
      } : {}),
      ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
      ...(parsed.data.assigneeId !== undefined ? { assigneeId: parsed.data.assigneeId } : {}),
      ...(parsed.data.dueDate !== undefined ? { dueAt: dueDateToTimestamp(parsed.data.dueDate) } : {}),
      updatedAt: now
    };

    const updated = await db.transaction(async (tx) => {
      const [result] = await tx.update(projectTasks)
        .set(updateValues)
        .where(and(eq(projectTasks.id, taskId), eq(projectTasks.projectId, projectId)))
        .returning();
      if (!result) return null;

      const eventType = parsed.data.status !== undefined && parsed.data.status !== task.status
        ? "project.task_status_changed"
        : "project.task_updated";

      await tx.insert(activityEvents).values({
        projectId,
        actorId: session.user.id,
        eventType,
        metadata: { taskId, title: result.title, changedFields: Object.keys(parsed.data) }
      });
      return result;
    });

    if (!updated) {
      return NextResponse.json({ error: "وظیفه پیدا نشد." }, { status: 404 });
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
