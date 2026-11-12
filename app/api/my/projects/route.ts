import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { disciplines, projectMembers, projects } from "@/src/db/schema";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  }

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "برای مشاهده فضای شخصی وارد حساب کاربری شوید." }, { status: 401 });
    }

    const rows = await getDb()
      .select({
        id: projects.id,
        slug: projects.slug,
        title: projects.title,
        summary: projects.summary,
        status: projects.status,
        visibility: projects.visibility,
        updatedAt: projects.updatedAt,
        discipline: disciplines.nameFa,
        role: projectMembers.role
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .leftJoin(disciplines, eq(projects.disciplineId, disciplines.id))
      .where(eq(projectMembers.userId, session.user.id))
      .orderBy(desc(projects.updatedAt))
      .limit(100);

    return NextResponse.json({
      projects: rows.map((row) => ({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
        discipline: row.discipline ?? "میان‌رشته‌ای"
      })),
      total: rows.length
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/my/projects failed:", error);
    return NextResponse.json({ error: "دریافت پروژه‌های شما با خطا مواجه شد." }, { status: 500 });
  }
}
