import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { activityEvents, collaborationRequests, notifications, projectMembers, projects } from "@/src/db/schema";
import { buildNotificationRows } from "@/lib/notifications";

export const runtime = "nodejs";

const requestInput = z.object({ message: z.string().trim().max(1000).optional().default("") });

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
      return NextResponse.json({ error: "برای درخواست همکاری ابتدا وارد حساب کاربری شوید." }, { status: 401 });
    }

    const { projectId } = await context.params;
    let body: unknown = {};
    const rawBody = await request.text();
    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return NextResponse.json({ error: "بدنه درخواست JSON معتبر نیست." }, { status: 400 });
      }
    }
    const parsed = requestInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "پیام درخواست معتبر نیست یا بیش از ۱۰۰۰ نویسه است." }, { status: 400 });
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
      return NextResponse.json({ error: "پروژه عمومی پیدا نشد." }, { status: 404 });
    }
    const db = getDb();
    const [project] = await db
      .select({ id: projects.id, visibility: projects.visibility, ownerId: projects.ownerId, title: projects.title, slug: projects.slug })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project || project.visibility === "private") {
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

    const created = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(collaborationRequests)
        .values({
          projectId,
          userId: session.user.id,
          message: parsed.data.message
        })
        .onConflictDoNothing()
        .returning({ id: collaborationRequests.id });

      if (!inserted) return null;

      await tx.insert(activityEvents).values({
        projectId,
        actorId: session.user.id,
        eventType: "collaboration.requested",
        metadata: { requestId: inserted.id }
      });

      const managers = await tx.select({ userId: projectMembers.userId }).from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          inArray(projectMembers.role, ["owner", "maintainer"])
        ));
      const rows = buildNotificationRows({
        recipientIds: managers.map((member) => member.userId),
        actorId: session.user.id,
        projectId,
        type: "collaboration_request",
        title: "درخواست همکاری تازه",
        body: "برای پروژه «" + project.title + "» درخواست همکاری ثبت شده است.",
        href: "/projects/" + encodeURIComponent(project.slug)
      });
      if (rows.length) await tx.insert(notifications).values(rows);
      return inserted;
    });

    if (!created) {
      return NextResponse.json({
        message: "درخواست همکاری شما قبلاً ثبت شده است.",
        alreadyRequested: true
      });
    }

    return NextResponse.json({ message: "درخواست همکاری ثبت شد.", requestId: created.id }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects/[projectId]/join failed:", error);
    return NextResponse.json({ error: "ثبت درخواست همکاری با خطا مواجه شد." }, { status: 500 });
  }
}


export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  }

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "برای لغو درخواست همکاری وارد حساب کاربری شوید." }, { status: 401 });
    }

    const { projectId } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
      return NextResponse.json({ error: "پروژه پیدا نشد." }, { status: 404 });
    }

    const db = getDb();
    const outcome = await db.transaction(async (tx) => {
      const [pending] = await tx
        .select({ id: collaborationRequests.id })
        .from(collaborationRequests)
        .where(and(
          eq(collaborationRequests.projectId, projectId),
          eq(collaborationRequests.userId, session.user.id),
          eq(collaborationRequests.status, "pending")
        ))
        .limit(1);

      if (!pending) return "not_found" as const;

      const [withdrawn] = await tx
        .update(collaborationRequests)
        .set({ status: "withdrawn", updatedAt: new Date() })
        .where(and(
          eq(collaborationRequests.id, pending.id),
          eq(collaborationRequests.status, "pending")
        ))
        .returning({ id: collaborationRequests.id });

      if (!withdrawn) return "not_found" as const;

      await tx.insert(activityEvents).values({
        projectId,
        actorId: session.user.id,
        eventType: "collaboration.withdrawn",
        metadata: { requestId: withdrawn.id }
      });

      return "withdrawn" as const;
    });

    if (outcome === "not_found") {
      return NextResponse.json({ error: "درخواست معلقی برای لغو پیدا نشد." }, { status: 404 });
    }

    return NextResponse.json({ message: "درخواست همکاری لغو شد." });
  } catch (error) {
    console.error("DELETE /api/projects/[projectId]/join failed:", error);
    return NextResponse.json({ error: "لغو درخواست همکاری انجام نشد." }, { status: 500 });
  }
}
