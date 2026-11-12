import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { activityEvents, disciplines, projectMembers, projects } from "@/src/db/schema";
import { updateProjectInput } from "@/src/db/validators";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  }

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "برای ویرایش پروژه وارد حساب کاربری شوید." }, { status: 401 });
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

    const parsed = updateProjectInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: "اطلاعات تغییر پروژه معتبر نیست.",
        details: parsed.error.flatten().fieldErrors
      }, { status: 400 });
    }

    const db = getDb();
    const [membership] = await db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, session.user.id)))
      .limit(1);

    if (membership?.role !== "owner") {
      return NextResponse.json({ error: "فقط بنیان‌گذار پروژه می‌تواند مشخصات و سطح دسترسی آن را تغییر دهد." }, { status: 403 });
    }

    let disciplineId: string | undefined;
    if (parsed.data.disciplineSlug) {
      const [discipline] = await db
        .select({ id: disciplines.id })
        .from(disciplines)
        .where(eq(disciplines.slug, parsed.data.disciplineSlug))
        .limit(1);
      if (!discipline) {
        return NextResponse.json({ error: "حوزه علمی انتخاب‌شده پیدا نشد." }, { status: 400 });
      }
      disciplineId = discipline.id;
    }

    const updateValues = {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.visibility !== undefined ? { visibility: parsed.data.visibility } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(disciplineId !== undefined ? { disciplineId } : {}),
      updatedAt: new Date()
    };

    const updated = await db.transaction(async (tx) => {
      const [project] = await tx
        .update(projects)
        .set(updateValues)
        .where(eq(projects.id, projectId))
        .returning();

      if (!project) return null;

      await tx.insert(activityEvents).values({
        projectId,
        actorId: session.user.id,
        eventType: "project.updated",
        metadata: { changedFields: Object.keys(parsed.data) }
      });

      return project;
    });

    if (!updated) {
      return NextResponse.json({ error: "پروژه پیدا نشد." }, { status: 404 });
    }

    let disciplineName = "میان‌رشته‌ای";
    if (updated.disciplineId) {
      const [discipline] = await db
        .select({ nameFa: disciplines.nameFa })
        .from(disciplines)
        .where(eq(disciplines.id, updated.disciplineId))
        .limit(1);
      disciplineName = discipline?.nameFa ?? disciplineName;
    }

    return NextResponse.json({
      project: {
        id: updated.id,
        slug: updated.slug,
        title: updated.title,
        summary: updated.summary,
        description: updated.description,
        visibility: updated.visibility,
        status: updated.status,
        discipline: disciplineName,
        updatedAt: updated.updatedAt
      }
    });
  } catch (error) {
    console.error("PATCH /api/projects/[projectId] failed:", error);
    return NextResponse.json({ error: "ذخیره تغییرات پروژه با خطا مواجه شد." }, { status: 500 });
  }
}
