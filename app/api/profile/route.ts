import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { profileSkills, profiles } from "@/src/db/schema";
import { updateProfileInput } from "@/src/db/validators";

export const runtime = "nodejs";

function unavailable() {
  return NextResponse.json(
    { error: "پایگاه داده هنوز پیکربندی نشده است." },
    { status: 503 }
  );
}

async function getCurrentProfile(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user?.id) return null;

  const db = getDb();
  let [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, session.user.id))
    .limit(1);

  if (!profile) {
    const suffix = session.user.id.replace(/[^a-z0-9]/gi, "").slice(-10).toLowerCase() || "member";
    const generatedHandle = `researcher-${suffix}`.slice(0, 40);
    await db.insert(profiles).values({
      userId: session.user.id,
      handle: generatedHandle,
      isPublic: true
    }).onConflictDoNothing({ target: profiles.userId });

    [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, session.user.id))
      .limit(1);
  }

  if (!profile) throw new Error("Could not provision a profile for this account.");
  return { session, profile };
}

async function readSkills(userId: string) {
  return getDb()
    .select({ label: profileSkills.label })
    .from(profileSkills)
    .where(eq(profileSkills.userId, userId))
    .orderBy(asc(profileSkills.sortOrder), asc(profileSkills.label));
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return unavailable();

  try {
    const current = await getCurrentProfile(request);
    if (!current) {
      return NextResponse.json({ error: "برای مشاهده پروفایل وارد حساب کاربری شوید." }, { status: 401 });
    }

    const skills = await readSkills(current.session.user.id);
    return NextResponse.json({
      user: {
        id: current.session.user.id,
        name: current.session.user.name,
        email: current.session.user.email
      },
      profile: {
        ...current.profile,
        skills: skills.map((skill) => skill.label)
      }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/profile failed:", error);
    return NextResponse.json({ error: "دریافت پروفایل با خطا مواجه شد." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!process.env.DATABASE_URL) return unavailable();

  try {
    const current = await getCurrentProfile(request);
    if (!current) {
      return NextResponse.json({ error: "برای ویرایش پروفایل وارد حساب کاربری شوید." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بدنه درخواست JSON معتبر نیست." }, { status: 400 });
    }

    const parsed = updateProfileInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: "اطلاعات پروفایل معتبر نیست.",
        details: parsed.error.flatten().fieldErrors
      }, { status: 400 });
    }

    const { skills, ...profileFields } = parsed.data;
    const uniqueSkills: Array<{ label: string; normalizedLabel: string; sortOrder: number }> = [];
    const seen = new Set<string>();

    for (const rawSkill of skills ?? []) {
      const label = rawSkill.normalize("NFKC").trim().replace(/\s+/g, " ");
      const normalizedLabel = label.toLocaleLowerCase("fa");
      if (!label || seen.has(normalizedLabel)) continue;
      seen.add(normalizedLabel);
      uniqueSkills.push({ label, normalizedLabel, sortOrder: uniqueSkills.length });
    }

    const saved = await getDb().transaction(async (tx) => {
      const [updated] = await tx
        .update(profiles)
        .set({
          ...profileFields,
          website: profileFields.website || null,
          updatedAt: new Date()
        })
        .where(eq(profiles.userId, current.session.user.id))
        .returning();

      if (!updated) throw new Error("Profile update returned no row.");

      if (skills !== undefined) {
        await tx.delete(profileSkills).where(eq(profileSkills.userId, current.session.user.id));
        if (uniqueSkills.length) {
          await tx.insert(profileSkills).values(uniqueSkills.map((skill) => ({
            userId: current.session.user.id,
            ...skill
          })));
        }
      }

      const skillRows = await tx
        .select({ label: profileSkills.label })
        .from(profileSkills)
        .where(eq(profileSkills.userId, current.session.user.id))
        .orderBy(asc(profileSkills.sortOrder), asc(profileSkills.label));

      return { profile: updated, skills: skillRows.map((skill) => skill.label) };
    });

    return NextResponse.json({
      profile: { ...saved.profile, skills: saved.skills }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("profile_handle_unique") || message.includes("duplicate key")) {
      return NextResponse.json({ error: "این شناسه قبلاً انتخاب شده است." }, { status: 409 });
    }
    console.error("PUT /api/profile failed:", error);
    return NextResponse.json({ error: "ذخیره پروفایل با خطا مواجه شد." }, { status: 500 });
  }
}
