import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { activityEvents, projectMembers, projectTasks, user } from "@/src/db/schema";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "تاریخ مهلت معتبر نیست.");

const createTaskInput = z.object({
  title: z.string().trim().min(3, "عنوان وظیفه باید دست‌کم ۳ نویسه باشد.").max(180),
  description: z.string().trim().max(5000).optional().default(""),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  assigneeId: z.string().max(128).nullable().optional(),
  dueDate: z.union([dateOnly, z.null()]).optional()
}).strict();

function dueDateToTimestamp(value?: string | null) {
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

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  }

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "برای مشاهده وظایف پروژه وارد حساب کاربری شوید." }, { status: 401 });
    }

    const { projectId } = await context.params;
    if (!uuidPattern.test(projectId)) {
      return NextResponse.json({ error: "پروژه پیدا نشد." }, { status: 404 });
    }

    const db = getDb();
    const membership = await getMembership(projectId, session.user.id);
    if (!membership) {
      return NextResponse.json({ error: "تابلوی وظایف فقط برای اعضای پروژه در دسترس است." }, { status: 404 });
    }

    const [tasks, members] = await Promise.all([
      db.select({
        id: projectTasks.id,
        title: projectTasks.title,
        description: projectTasks.description,
        status: projectTasks.status,
        priority: projectTasks.priority,
        assigneeId: projectTasks.assigneeId,
        createdBy: projectTasks.createdBy,
        dueAt: projectTasks.dueAt,
        createdAt: projectTasks.createdAt,
        updatedAt: projectTasks.updatedAt
      })
        .from(projectTasks)
        .where(eq(projectTasks.projectId, projectId))
        .orderBy(desc(projectTasks.createdAt))
        .limit(200),
      db.select({
        userId: projectMembers.userId,
        name: user.name,
        role: projectMembers.role
      })
        .from(projectMembers)
        .innerJoin(user, eq(projectMembers.userId, user.id))
        .where(eq(projectMembers.projectId, projectId))
    ]);

    return NextResponse.json({
      tasks,
      members,
      access: {
        role: membership.role,
        currentUserId: session.user.id,
        canCreate: membership.role !== "viewer"
      }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/projects/[projectId]/tasks failed:", error);
    return NextResponse.json({ error: "دریافت وظایف پروژه با خطا مواجه شد." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  }

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "برای ثبت وظیفه وارد حساب کاربری شوید." }, { status: 401 });
    }

    const { projectId } = await context.params;
    if (!uuidPattern.test(projectId)) {
      return NextResponse.json({ error: "پروژه پیدا نشد." }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بدنه درخواست JSON معتبر نیست." }, { status: 400 });
    }

    const parsed = createTaskInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: "اطلاعات وظیفه معتبر نیست.",
        details: parsed.error.flatten().fieldErrors
      }, { status: 400 });
    }

    const db = getDb();
    const membership = await getMembership(projectId, session.user.id);
    if (!membership || membership.role === "viewer") {
      return NextResponse.json({ error: "اجازه ایجاد وظیفه در این پروژه را ندارید." }, { status: 403 });
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

    const created = await db.transaction(async (tx) => {
      const [task] = await tx.insert(projectTasks).values({
        projectId,
        createdBy: session.user.id,
        assigneeId: parsed.data.assigneeId ?? null,
        title: parsed.data.title,
        description: parsed.data.description,
        priority: parsed.data.priority,
        dueAt: dueDateToTimestamp(parsed.data.dueDate)
      }).returning();

      await tx.insert(activityEvents).values({
        projectId,
        actorId: session.user.id,
        eventType: "project.task_created",
        metadata: { taskId: task.id, title: task.title }
      });

      return task;
    });

    return NextResponse.json({ task: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects/[projectId]/tasks failed:", error);
    return NextResponse.json({ error: "ثبت وظیفه جدید انجام نشد." }, { status: 500 });
  }
}
