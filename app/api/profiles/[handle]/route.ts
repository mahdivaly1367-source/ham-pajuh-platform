import { and, count, desc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/src/db";
import { activityEvents, disciplines, profiles, projectMembers, projects, user } from "@/src/db/schema";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ handle: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  }

  try {
    const { handle } = await context.params;
    if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(handle)) {
      return NextResponse.json({ error: "پروفایل عمومی پیدا نشد." }, { status: 404 });
    }

    const db = getDb();
    const [identity] = await db
      .select({
        userId: profiles.userId,
        handle: profiles.handle,
        headline: profiles.headline,
        bio: profiles.bio,
        location: profiles.location,
        website: profiles.website,
        name: user.name
      })
      .from(profiles)
      .innerJoin(user, eq(profiles.userId, user.id))
      .where(and(eq(profiles.handle, handle), eq(profiles.isPublic, true)))
      .limit(1);

    if (!identity) {
      return NextResponse.json({ error: "پروفایل عمومی پیدا نشد." }, { status: 404 });
    }

    const projectRows = await db
      .select({
        id: projects.id,
        slug: projects.slug,
        title: projects.title,
        summary: projects.summary,
        status: projects.status,
        updatedAt: projects.updatedAt,
        disciplineName: disciplines.nameFa,
        role: projectMembers.role
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .leftJoin(disciplines, eq(projects.disciplineId, disciplines.id))
      .where(and(
        eq(projectMembers.userId, identity.userId),
        eq(projects.visibility, "public"),
        ne(projects.status, "archived")
      ))
      .orderBy(desc(projects.updatedAt))
      .limit(50);

    const [activityCount] = await db
      .select({ total: count() })
      .from(activityEvents)
      .where(eq(activityEvents.actorId, identity.userId));

    return NextResponse.json({
      user: { name: identity.name },
      profile: {
        handle: identity.handle,
        headline: identity.headline,
        bio: identity.bio,
        location: identity.location,
        website: identity.website
      },
      stats: {
        publicProjects: projectRows.length,
        recordedActivities: Number(activityCount?.total ?? 0)
      },
      projects: projectRows.map((project) => ({
        ...project,
        updatedAt: project.updatedAt.toISOString(),
        discipline: project.disciplineName ?? "میان‌رشته‌ای"
      }))
    }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
  } catch (error) {
    console.error("GET /api/profiles/[handle] failed:", error);
    return NextResponse.json({ error: "دریافت پروفایل عمومی با خطا مواجه شد." }, { status: 500 });
  }
}
