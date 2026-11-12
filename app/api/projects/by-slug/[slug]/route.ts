import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { disciplines, profiles, projectMembers, projects, user } from "@/src/db/schema";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  }

  try {
    const { slug } = await context.params;
    if (!slug || slug.length > 140) {
      return NextResponse.json({ error: "پروژه پیدا نشد." }, { status: 404 });
    }

    const db = getDb();
    const [project] = await db
      .select({
        id: projects.id,
        slug: projects.slug,
        title: projects.title,
        summary: projects.summary,
        description: projects.description,
        visibility: projects.visibility,
        status: projects.status,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        discipline: disciplines.nameFa,
        ownerId: projects.ownerId,
        ownerName: user.name,
        ownerHandle: profiles.handle
      })
      .from(projects)
      .leftJoin(disciplines, eq(projects.disciplineId, disciplines.id))
      .innerJoin(user, eq(projects.ownerId, user.id))
      .leftJoin(profiles, and(eq(projects.ownerId, profiles.userId), eq(profiles.isPublic, true)))
      .where(eq(projects.slug, slug))
      .limit(1);

    if (!project || project.status === "archived") {
      return NextResponse.json({ error: "پروژه پیدا نشد." }, { status: 404 });
    }

    const session = await getAuth().api.getSession({ headers: request.headers });
    let currentRole: string | null = null;

    if (session?.user?.id) {
      const [membership] = await db
        .select({ role: projectMembers.role })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, session.user.id)))
        .limit(1);
      currentRole = membership?.role ?? null;
    }

    if (project.visibility === "private" && !currentRole) {
      return NextResponse.json({ error: "پروژه پیدا نشد یا دسترسی به آن مجاز نیست." }, { status: 404 });
    }

    const members = await db
      .select({
        userId: projectMembers.userId,
        name: user.name,
        handle: profiles.handle,
        role: projectMembers.role,
        joinedAt: projectMembers.joinedAt
      })
      .from(projectMembers)
      .innerJoin(user, eq(projectMembers.userId, user.id))
      .leftJoin(profiles, and(eq(projectMembers.userId, profiles.userId), eq(profiles.isPublic, true)))
      .where(eq(projectMembers.projectId, project.id))
      .orderBy(desc(projectMembers.joinedAt));

    return NextResponse.json({
      project: {
        id: project.id,
        slug: project.slug,
        title: project.title,
        summary: project.summary,
        description: project.description,
        visibility: project.visibility,
        status: project.status,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        discipline: project.discipline ?? "میان‌رشته‌ای",
        ownerName: project.ownerName,
        ownerHandle: project.ownerHandle
      },
      members: members.map((member) => ({
        memberId: currentRole === "owner" || member.userId === session?.user?.id ? member.userId : null,
        isCurrentUser: member.userId === session?.user?.id,
        name: member.name,
        handle: member.handle,
        role: member.role,
        joinedAt: member.joinedAt
      })),
      access: {
        isMember: Boolean(currentRole),
        role: currentRole,
        canManage: currentRole === "owner" || currentRole === "maintainer",
        canEdit: currentRole === "owner",
        canLeave: Boolean(currentRole && currentRole !== "owner")
      }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/projects/by-slug/[slug] failed:", error);
    return NextResponse.json({ error: "دریافت جزئیات پروژه با خطا مواجه شد." }, { status: 500 });
  }
}
