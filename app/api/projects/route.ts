import { randomUUID } from "node:crypto";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import {
  activityEvents,
  disciplines,
  projectMembers,
  projects,
  user
} from "@/src/db/schema";
import { createProjectInput } from "@/src/db/validators";

export const runtime = "nodejs";

const statusLabels: Record<string, string> = {
  idea: "ایده اولیه",
  active: "در حال توسعه",
  paused: "متوقف موقت",
  completed: "تکمیل‌شده",
  archived: "بایگانی‌شده"
};

function unavailable() {
  return NextResponse.json(
    { error: "پایگاه داده هنوز پیکربندی نشده است. DATABASE_URL را در محیط اجرا تنظیم کنید." },
    { status: 503 }
  );
}

function toProjectCard(row: {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: string;
  disciplineName: string | null;
  disciplineColor: string | null;
  ownerName: string | null;
  updatedAt: Date;
  members: number;
}) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    discipline: row.disciplineName ?? "میان‌رشته‌ای",
    color: row.disciplineColor ?? "mint",
    owner: row.ownerName ?? "پژوهشگر هم‌پژوه",
    initials: (row.ownerName ?? "هم‌پژوه").slice(0, 2),
    updated: row.updatedAt.toLocaleDateString("fa-IR"),
    members: row.members,
    stars: 0,
    tags: [] as string[],
    stage: statusLabels[row.status] ?? row.status
  };
}

export async function GET() {
  if (!process.env.DATABASE_URL) return unavailable();

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: projects.id,
        slug: projects.slug,
        title: projects.title,
        summary: projects.summary,
        status: projects.status,
        disciplineName: disciplines.nameFa,
        disciplineColor: disciplines.color,
        ownerName: user.name,
        updatedAt: projects.updatedAt
      })
      .from(projects)
      .leftJoin(disciplines, eq(projects.disciplineId, disciplines.id))
      .leftJoin(user, eq(projects.ownerId, user.id))
      .where(and(eq(projects.visibility, "public"), ne(projects.status, "archived")))
      .orderBy(desc(projects.updatedAt))
      .limit(48);

    const counts = await db
      .select({ projectId: projectMembers.projectId, members: count() })
      .from(projectMembers)
      .groupBy(projectMembers.projectId);

    const memberCounts = new Map(counts.map((item) => [item.projectId, item.members]));
    const result = rows.map((row) => toProjectCard({
      ...row,
      members: memberCounts.get(row.id) ?? 0
    }));

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("GET /api/projects failed:", error);
    return NextResponse.json({ error: "دریافت پروژه‌ها با خطا مواجه شد." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return unavailable();

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "برای ساخت پروژه ابتدا وارد حساب کاربری شوید." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بدنه درخواست JSON معتبر نیست." }, { status: 400 });
    }

    const parsed = createProjectInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: "اطلاعات پروژه معتبر نیست.",
        details: parsed.error.flatten().fieldErrors
      }, { status: 400 });
    }

    const db = getDb();
    const [discipline] = await db
      .select({ id: disciplines.id, nameFa: disciplines.nameFa, color: disciplines.color })
      .from(disciplines)
      .where(eq(disciplines.slug, parsed.data.disciplineSlug))
      .limit(1);

    if (!discipline) {
      return NextResponse.json({ error: "حوزه علمی انتخاب‌شده پیدا نشد. ابتدا داده‌های پایه را Seed کنید." }, { status: 400 });
    }

    const slugBase = parsed.data.title
      .normalize("NFKC")
      .toLocaleLowerCase("fa")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 110);
    const slug = (slugBase || "project") + "-" + randomUUID().slice(0, 8);

    const created = await db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({
          slug,
          title: parsed.data.title,
          summary: parsed.data.summary,
          description: parsed.data.description,
          disciplineId: discipline.id,
          ownerId: session.user.id,
          visibility: parsed.data.visibility,
          status: "idea"
        })
        .returning();

      if (!project) throw new Error("Project insert returned no row.");

      await tx.insert(projectMembers).values({
        projectId: project.id,
        userId: session.user.id,
        role: "owner"
      });

      await tx.insert(activityEvents).values({
        projectId: project.id,
        actorId: session.user.id,
        eventType: "project.created",
        metadata: { title: project.title, visibility: project.visibility }
      });

      return project;
    });

    return NextResponse.json({
      project: toProjectCard({
        id: created.id,
        slug: created.slug,
        title: created.title,
        summary: created.summary,
        status: created.status,
        disciplineName: discipline.nameFa,
        disciplineColor: discipline.color,
        ownerName: session.user.name,
        updatedAt: created.updatedAt,
        members: 1
      })
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects failed:", error);
    return NextResponse.json({ error: "ساخت پروژه با خطا مواجه شد." }, { status: 500 });
  }
}
