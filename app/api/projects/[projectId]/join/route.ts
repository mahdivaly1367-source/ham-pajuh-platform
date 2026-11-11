import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { activityEvents, collaborationRequests, projectMembers, projects } from "@/src/db/schema";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  }

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: "برای درخواست همکاری ابتدا وارد حساب کاربری شوید." }, { status: 401 });
    }

    const { projectId } = await context.params;
    const db = getDb();
    const [project] = await db
      .select({ id: projects.id, visibility: projects.visibility, ownerId: projects.ownerId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project || project.visibility !== "public") {
      return NextResponse.json({ error: "پروژه عمومی پیدا نشد." }, { status: 404 });
    }

    if (project.ownerId === session.user.id) {
      return NextResponse.json({ error: "این پروژه متعلق به شماست." }, { status: 409 });
    }

    const [membership] = await db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, session.user.id)))
      .limit(1);

    if (membership) {
      return NextResponse.json({ message: "شما عضو این پروژه هستید." }, { status: 409 });
    }

    const [existing] = await db
      .select({ id: collaborationRequests.id })
      .from(collaborationRequests)
      .where(and(
        eq(collaborationRequests.projectId, projectId),
        eq(collaborationRequests.userId, session.user.id),
        eq(collaborationRequests.status, "pending")
      ))
      .limit(1);

    if (existing) {
      return NextResponse.json({ message: "درخواست همکاری شما قبلاً ثبت شده است.", alreadyRequested: true });
    }

    const [created] = await db
      .insert(collaborationRequests)
      .values({
        projectId,
        userId: session.user.id,
        message: ""
      })
      .returning({ id: collaborationRequests.id });

    await db.insert(activityEvents).values({
      projectId,
      actorId: session.user.id,
      eventType: "collaboration.requested",
      metadata: { requestId: created.id }
    });

    return NextResponse.json({ message: "درخواست همکاری ثبت شد.", requestId: created.id }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects/[projectId]/join failed:", error);
    return NextResponse.json({ error: "ثبت درخواست همکاری با خطا مواجه شد." }, { status: 500 });
  }
}
