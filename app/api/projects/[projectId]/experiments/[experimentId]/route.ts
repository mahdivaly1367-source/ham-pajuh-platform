import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { activityEvents, projectDatasets, projectExperiments, projectMembers } from "@/src/db/schema";

export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = ["planned", "in_progress", "completed", "abandoned"] as const;
const fields = {
  title: z.string().trim().min(3).max(180),
  datasetId: z.string().uuid().nullable(),
  objective: z.string().trim().max(8000),
  hypothesis: z.string().trim().max(8000),
  protocol: z.string().trim().max(12000),
  materials: z.array(z.string().trim().min(1).max(160)).max(100),
  variables: z.array(z.string().trim().min(1).max(160)).max(100),
  controls: z.string().trim().max(8000),
  procedure: z.string().trim().max(20000),
  observations: z.string().trim().max(20000),
  conclusion: z.string().trim().max(12000),
  status: z.enum(statuses)
};
const updateSchema = z.object(fields).partial().strict().refine((value) => Object.keys(value).length > 0, {
  message: "حداقل یک فیلد برای ویرایش لازم است."
});

async function getMembership(projectId: string, userId: string) {
  const [member] = await getDb().select({ role: projectMembers.role }).from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).limit(1);
  return member ?? null;
}
async function authorize(request: Request, projectId: string) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user?.id) return { response: NextResponse.json({ error: "برای ادامه وارد حساب کاربری شوید." }, { status: 401 }) };
  const member = await getMembership(projectId, session.user.id);
  if (!member) return { response: NextResponse.json({ error: "دفتر آزمایش فقط برای اعضای پروژه در دسترس است." }, { status: 404 }) };
  if (member.role === "viewer") return { response: NextResponse.json({ error: "دسترسی ویرایش برای نقش مشاهده‌گر فعال نیست." }, { status: 403 }) };
  return { userId: session.user.id };
}

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string; experimentId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "پایگاه داده هنوز پیکربندی نشده است." }, { status: 503 });
  try {
    const { projectId, experimentId } = await context.params;
    if (!uuidPattern.test(projectId) || !uuidPattern.test(experimentId)) return NextResponse.json({ error: "آزمایش پیدا نشد." }, { status: 404 });
    const access = await authorize(request, projectId);
    if ("response" in access) return access.response;
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "بدنه درخواست JSON معتبر نیست." }, { status: 400 }); }
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "اطلاعات ویرایش معتبر نیست.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    const db = getDb();
    const [existing] = await db.select().from(projectExperiments)
      .where(and(eq(projectExperiments.id, experimentId), eq(projectExperiments.projectId, projectId))).limit(1);
    if (!existing) return NextResponse.json({ error: "آزمایش پیدا نشد." }, { status: 404 });
    if (parsed.data.datasetId) {
      const [dataset] = await db.select({ id: projectDatasets.id }).from(projectDatasets)
        .where(and(eq(projectDatasets.id, parsed.data.datasetId), eq(projectDatasets.projectId, projectId))).limit(1);
      if (!dataset) return NextResponse.json({ error: "مجموعه‌داده انتخاب‌شده متعلق به این پروژه نیست." }, { status: 400 });
    }
    const changes = Object.entries(parsed.data).filter(([key, value]) =>
      JSON.stringify(existing[key as keyof typeof existing]) !== JSON.stringify(value)
    ).map(([field]) => field);
    if (!changes.length) return NextResponse.json({ experiment: existing, unchanged: true });
    const updated = await db.transaction(async (tx) => {
      const [result] = await tx.update(projectExperiments).set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(projectExperiments.id, experimentId), eq(projectExperiments.projectId, projectId), eq(projectExperiments.updatedAt, existing.updatedAt))).returning();
      if (!result) return null;
      await tx.insert(activityEvents).values({ projectId, actorId: access.userId, eventType: "project.experiment_updated",
        metadata: { experimentId, title: result.title, changedFields: changes } });
      return result;
    });
    if (!updated) return NextResponse.json({ error: "آزمایش هم‌زمان تغییر کرده است؛ صفحه را تازه‌سازی کنید." }, { status: 409 });
    return NextResponse.json({ experiment: updated });
  } catch (error) {
    console.error("PATCH project experiment failed:", error);
    return NextResponse.json({ error: "ویرایش آزمایش انجام نشد." }, { status: 500 });
  }
}
