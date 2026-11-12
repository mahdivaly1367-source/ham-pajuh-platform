import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { activityEvents, projectDatasets, projectMembers } from "@/src/db/schema";

export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const inputSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(5000).default(""),
  dataFormat: z.string().trim().min(1).max(60),
  license: z.string().trim().max(80).default(""),
  doi: z.string().trim().max(120).default("").refine((v) => !v || /^(https?:\/\/doi\.org\/)?10\.\d{4,9}\/[\w.()\/:;-]+$/i.test(v), "شناسه DOI معتبر نیست."),
  recordCount: z.number().int().nonnegative().max(2_000_000_000).nullable().optional(),
  variables: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  methodology: z.string().trim().max(8000).default(""),
  sourceReference: z.string().trim().max(500).default("").refine((v) => !v || /^https?:\/\//i.test(v), "نشانی منبع باید با HTTP یا HTTPS آغاز شود.")
}).strict();

async function getMembership(projectId: string, userId: string) {
  const [member] = await getDb().select({ role: projectMembers.role }).from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).limit(1);
  return member ?? null;
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) return NextResponse.json({ error: "برای مشاهده فراداده وارد حساب کاربری شوید." }, { status: 401 });
    const { projectId } = await context.params;
    if (!uuidPattern.test(projectId)) return NextResponse.json({ error: "پروژه پیدا نشد." }, { status: 404 });
    if (!await getMembership(projectId, session.user.id)) return NextResponse.json({ error: "فراداده فقط برای اعضای پروژه در دسترس است." }, { status: 404 });
    const datasets = await getDb().select().from(projectDatasets).where(eq(projectDatasets.projectId, projectId))
      .orderBy(desc(projectDatasets.createdAt)).limit(100);
    return NextResponse.json({ datasets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET project datasets failed:", error);
    return NextResponse.json({ error: "دریافت فراداده مجموعه‌داده‌ها انجام نشد." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.id) return NextResponse.json({ error: "برای ثبت مجموعه‌داده وارد حساب کاربری شوید." }, { status: 401 });
    const { projectId } = await context.params;
    if (!uuidPattern.test(projectId)) return NextResponse.json({ error: "پروژه پیدا نشد." }, { status: 404 });
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "بدنه درخواست JSON معتبر نیست." }, { status: 400 }); }
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "اطلاعات مجموعه‌داده معتبر نیست.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    const member = await getMembership(projectId, session.user.id);
    if (!member || member.role === "viewer") return NextResponse.json({ error: "اجازه ثبت مجموعه‌داده در این پروژه را ندارید." }, { status: member ? 403 : 404 });
    const dataset = await getDb().transaction(async (tx) => {
      const [created] = await tx.insert(projectDatasets).values({
        projectId, createdBy: session.user.id, ...parsed.data, recordCount: parsed.data.recordCount ?? null
      }).returning();
      await tx.insert(activityEvents).values({
        projectId, actorId: session.user.id, eventType: "project.dataset_registered",
        metadata: { datasetId: created.id, title: created.title, dataFormat: created.dataFormat }
      });
      return created;
    });
    return NextResponse.json({ dataset }, { status: 201 });
  } catch (error) {
    console.error("POST project datasets failed:", error);
    return NextResponse.json({ error: "ثبت فراداده مجموعه‌داده انجام نشد." }, { status: 500 });
  }
}
