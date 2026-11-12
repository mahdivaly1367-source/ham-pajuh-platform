import { and, count, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { notifications, projectMembers, user } from "@/src/db/schema";

export const runtime = "nodejs";

const updateInput = z.union([
  z.object({ action: z.literal("read"), notificationId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("read_all") }).strict()
]);

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  }

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "برای مشاهده اعلان‌ها وارد حساب کاربری شوید." }, { status: 401 });
    }

    const db = getDb();
    const [rows, unreadRows] = await Promise.all([
      db.select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        href: notifications.href,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
        actorName: user.name
      })
        .from(notifications)
        .leftJoin(user, eq(notifications.actorId, user.id))
        .leftJoin(projectMembers, and(
          eq(projectMembers.projectId, notifications.projectId),
          eq(projectMembers.userId, session.user.id)
        ))
        .where(and(
          eq(notifications.recipientId, session.user.id),
          or(isNull(notifications.projectId), isNotNull(projectMembers.id))
        ))
        .orderBy(desc(notifications.createdAt))
        .limit(30),
      db.select({ value: count() })
        .from(notifications)
        .leftJoin(projectMembers, and(
          eq(projectMembers.projectId, notifications.projectId),
          eq(projectMembers.userId, session.user.id)
        ))
        .where(and(
          eq(notifications.recipientId, session.user.id),
          isNull(notifications.readAt),
          or(isNull(notifications.projectId), isNotNull(projectMembers.id))
        ))
    ]);

    return NextResponse.json({
      notifications: rows.map((row) => ({
        ...row,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        actorName: row.actorName ?? "سامانه"
      })),
      unreadCount: unreadRows[0]?.value ?? 0
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/notifications failed:", error);
    return NextResponse.json({ error: "دریافت اعلان‌ها با خطا مواجه شد." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  }

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "برای تغییر اعلان‌ها وارد حساب کاربری شوید." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بدنه درخواست JSON معتبر نیست." }, { status: 400 });
    }

    const parsed = updateInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "عملیات اعلان معتبر نیست." }, { status: 400 });
    }

    const db = getDb();
    const now = new Date();
    if (parsed.data.action === "read_all") {
      const result = await db.update(notifications)
        .set({ readAt: now })
        .where(and(eq(notifications.recipientId, session.user.id), isNull(notifications.readAt)))
        .returning({ id: notifications.id });
      return NextResponse.json({ updated: result.length });
    }

    const [updated] = await db.update(notifications)
      .set({ readAt: now })
      .where(and(
        eq(notifications.id, parsed.data.notificationId),
        eq(notifications.recipientId, session.user.id),
        isNull(notifications.readAt)
      ))
      .returning({ id: notifications.id });

    if (!updated) {
      return NextResponse.json({ error: "اعلان خوانده‌نشده‌ای با این شناسه پیدا نشد." }, { status: 404 });
    }

    return NextResponse.json({ updated: 1 });
  } catch (error) {
    console.error("PATCH /api/notifications failed:", error);
    return NextResponse.json({ error: "به‌روزرسانی اعلان انجام نشد." }, { status: 500 });
  }
}
