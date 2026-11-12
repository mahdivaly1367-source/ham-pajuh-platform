import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { collaborationRequests, profiles, projectMembers, user } from "@/src/db/schema";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      return NextResponse.json({ error: "برای مدیریت درخواست‌ها وارد حساب کاربری شوید." }, { status: 401 });
    }

    const { projectId } = await context.params;
    if (!uuidPattern.test(projectId)) {
      return NextResponse.json({ error: "پروژه پیدا نشد." }, { status: 404 });
    }

    const db = getDb();
    const [membership] = await db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, session.user.id)))
      .limit(1);

    if (!membership || !["owner", "maintainer"].includes(membership.role)) {
      return NextResponse.json({ error: "اجازه مشاهده درخواست‌های این پروژه را ندارید." }, { status: 403 });
    }

    const requests = await db
      .select({
        id: collaborationRequests.id,
        message: collaborationRequests.message,
        status: collaborationRequests.status,
        createdAt: collaborationRequests.createdAt,
        userName: user.name,
        userHandle: profiles.handle
      })
      .from(collaborationRequests)
      .innerJoin(user, eq(collaborationRequests.userId, user.id))
      .leftJoin(profiles, and(eq(collaborationRequests.userId, profiles.userId), eq(profiles.isPublic, true)))
      .where(and(
        eq(collaborationRequests.projectId, projectId),
        eq(collaborationRequests.status, "pending")
      ))
      .orderBy(asc(collaborationRequests.createdAt));

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("GET /api/projects/[projectId]/requests failed:", error);
    return NextResponse.json({ error: "دریافت درخواست‌های همکاری با خطا مواجه شد." }, { status: 500 });
  }
}
