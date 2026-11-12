import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { activityEvents, projectMembers } from "@/src/db/schema";

export const runtime = "nodejs";
const roleInput = z.object({ role: z.enum(["maintainer", "contributor", "viewer"]) });
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string; memberId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) return NextResponse.json({ error: "برای مدیریت اعضا وارد حساب کاربری شوید." }, { status: 401 });

    const { projectId, memberId } = await context.params;
    if (!uuidPattern.test(projectId) || !memberId || memberId.length > 128) {
      return NextResponse.json({ error: "عضو یا پروژه پیدا نشد." }, { status: 404 });
    }

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "بدنه درخواست JSON معتبر نیست." }, { status: 400 }); }

    const parsed = roleInput.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "نقش انتخاب‌شده معتبر نیست." }, { status: 400 });

    const db = getDb();
    const [ownerMembership] = await db.select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, session.user.id)))
      .limit(1);

    if (ownerMembership?.role !== "owner") {
      return NextResponse.json({ error: "فقط بنیان‌گذار پروژه می‌تواند نقش اعضا را تغییر دهد." }, { status: 403 });
    }
    if (memberId === session.user.id) {
      return NextResponse.json({ error: "نقش بنیان‌گذار قابل تغییر نیست." }, { status: 409 });
    }

    const outcome = await db.transaction(async (tx) => {
      const [target] = await tx.select({ role: projectMembers.role })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberId)))
        .limit(1);

      if (!target) return "not_found" as const;
      if (target.role === "owner") return "owner" as const;
      if (target.role === parsed.data.role) return "unchanged" as const;

      const [updated] = await tx.update(projectMembers)
        .set({ role: parsed.data.role })
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberId)))
        .returning({ userId: projectMembers.userId });

      if (!updated) return "not_found" as const;

      await tx.insert(activityEvents).values({
        projectId,
        actorId: session.user.id,
        eventType: "project.member_role_changed",
        metadata: { memberId, previousRole: target.role, newRole: parsed.data.role }
      });
      return "updated" as const;
    });

    if (outcome === "not_found") return NextResponse.json({ error: "عضو پروژه پیدا نشد." }, { status: 404 });
    if (outcome === "owner") return NextResponse.json({ error: "نقش بنیان‌گذار قابل تغییر نیست." }, { status: 409 });

    return NextResponse.json({
      message: outcome === "unchanged" ? "این عضو از قبل همین نقش را دارد." : "نقش عضو به‌روزرسانی شد.",
      role: parsed.data.role
    });
  } catch (error) {
    console.error("PATCH /api/projects/[projectId]/members/[memberId] failed:", error);
    return NextResponse.json({ error: "تغییر نقش عضو با خطا مواجه شد." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string; memberId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  }

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "برای مدیریت عضویت وارد حساب کاربری شوید." }, { status: 401 });
    }

    const { projectId, memberId } = await context.params;
    if (!uuidPattern.test(projectId) || !memberId || memberId.length > 128) {
      return NextResponse.json({ error: "عضو یا پروژه پیدا نشد." }, { status: 404 });
    }

    const db = getDb();
    const [actorMembership] = await db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, session.user.id)
      ))
      .limit(1);

    const isSelfLeaving = memberId === session.user.id;
    if (!actorMembership) {
      return NextResponse.json({ error: "شما عضو این پروژه نیستید." }, { status: 403 });
    }
    if (!isSelfLeaving && actorMembership.role !== "owner") {
      return NextResponse.json({ error: "فقط بنیان‌گذار می‌تواند عضو دیگری را از پروژه خارج کند." }, { status: 403 });
    }
    if (actorMembership.role === "owner" && isSelfLeaving) {
      return NextResponse.json({ error: "بنیان‌گذار نمی‌تواند مستقیماً از پروژه خارج شود. ابتدا باید مالکیت را منتقل کند." }, { status: 409 });
    }

    const outcome = await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ role: projectMembers.role })
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, memberId)
        ))
        .limit(1);

      if (!target) return "not_found" as const;
      if (target.role === "owner") return "owner" as const;

      const [removed] = await tx
        .delete(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, memberId)
        ))
        .returning({ userId: projectMembers.userId });

      if (!removed) return "not_found" as const;

      await tx.insert(activityEvents).values({
        projectId,
        actorId: session.user.id,
        eventType: isSelfLeaving ? "project.member_left" : "project.member_removed",
        metadata: {
          memberId,
          previousRole: target.role
        }
      });

      return "removed" as const;
    });

    if (outcome === "not_found") {
      return NextResponse.json({ error: "عضو پروژه پیدا نشد." }, { status: 404 });
    }
    if (outcome === "owner") {
      return NextResponse.json({ error: "مالکیت پروژه از طریق حذف عضو قابل تغییر نیست." }, { status: 409 });
    }

    return NextResponse.json({
      message: isSelfLeaving ? "از پروژه خارج شدی." : "عضو از پروژه خارج شد."
    });
  } catch (error) {
    console.error("DELETE /api/projects/[projectId]/members/[memberId] failed:", error);
    return NextResponse.json({ error: "خروج یا حذف عضو انجام نشد." }, { status: 500 });
  }
}
