import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { activityEvents, collaborationRequests, projectMembers } from "@/src/db/schema";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reviewInput = z.object({ action: z.enum(["accept", "decline"]) });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; requestId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  }

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "برای بررسی درخواست وارد حساب کاربری شوید." }, { status: 401 });
    }

    const { projectId, requestId } = await context.params;
    if (!uuidPattern.test(projectId) || !uuidPattern.test(requestId)) {
      return NextResponse.json({ error: "درخواست همکاری پیدا نشد." }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بدنه درخواست JSON معتبر نیست." }, { status: 400 });
    }

    const parsed = reviewInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "عملیات درخواستی معتبر نیست." }, { status: 400 });
    }

    const db = getDb();
    const [membership] = await db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, session.user.id)))
      .limit(1);

    if (!membership || !["owner", "maintainer"].includes(membership.role)) {
      return NextResponse.json({ error: "فقط مدیران پروژه می‌توانند درخواست‌ها را بررسی کنند." }, { status: 403 });
    }

    const outcome = await db.transaction(async (tx) => {
      const [collaborationRequest] = await tx
        .select({
          id: collaborationRequests.id,
          userId: collaborationRequests.userId,
          status: collaborationRequests.status
        })
        .from(collaborationRequests)
        .where(and(
          eq(collaborationRequests.id, requestId),
          eq(collaborationRequests.projectId, projectId)
        ))
        .limit(1);

      if (!collaborationRequest) return { kind: "not_found" as const };
      if (collaborationRequest.status !== "pending") return { kind: "already_reviewed" as const };

      if (parsed.data.action === "accept") {
        await tx.insert(projectMembers).values({
          projectId,
          userId: collaborationRequest.userId,
          role: "contributor"
        }).onConflictDoNothing();
      }

      const status = parsed.data.action === "accept" ? "accepted" : "declined";
      const [updated] = await tx
        .update(collaborationRequests)
        .set({
          status,
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(
          eq(collaborationRequests.id, requestId),
          eq(collaborationRequests.status, "pending")
        ))
        .returning({ id: collaborationRequests.id });

      if (!updated) return { kind: "already_reviewed" as const };

      await tx.insert(activityEvents).values({
        projectId,
        actorId: session.user.id,
        eventType: parsed.data.action === "accept" ? "collaboration.accepted" : "collaboration.declined",
        metadata: { requestId, participantId: collaborationRequest.userId }
      });

      return { kind: "updated" as const, status, userId: collaborationRequest.userId };
    });

    if (outcome.kind === "not_found") {
      return NextResponse.json({ error: "درخواست همکاری پیدا نشد." }, { status: 404 });
    }
    if (outcome.kind === "already_reviewed") {
      return NextResponse.json({ error: "این درخواست قبلاً بررسی شده است." }, { status: 409 });
    }

    return NextResponse.json({
      message: outcome.status === "accepted" ? "درخواست پذیرفته شد و فرد به اعضای پروژه اضافه شد." : "درخواست رد شد.",
      status: outcome.status
    });
  } catch (error) {
    console.error("PATCH /api/projects/[projectId]/requests/[requestId] failed:", error);
    return NextResponse.json({ error: "بررسی درخواست همکاری با خطا مواجه شد." }, { status: 500 });
  }
}
