import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/src/db";
import { profiles, user } from "@/src/db/schema";
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
    // Handles Persian-only display names without forcing transliteration.
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

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return unavailable();

  try {
    const current = await getCurrentProfile(request);
    if (!current) {
      return NextResponse.json({ error: "برای مشاهده پروفایل وارد حساب کاربری شوید." }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: current.session.user.id,
        name: current.session.user.name,
        email: current.session.user.email
      },
      profile: current.profile
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

    const [updated] = await getDb()
      .update(profiles)
      .set({
        ...parsed.data,
        website: parsed.data.website || null,
        updatedAt: new Date()
      })
      .where(eq(profiles.userId, current.session.user.id))
      .returning();

    if (!updated) throw new Error("Profile update returned no row.");

    return NextResponse.json({ profile: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("profile_handle_unique") || message.includes("duplicate key")) {
      return NextResponse.json({ error: "این شناسه قبلاً انتخاب شده است." }, { status: 409 });
    }
    console.error("PUT /api/profile failed:", error);
    return NextResponse.json({ error: "ذخیره پروفایل با خطا مواجه شد." }, { status: 500 });
  }
}
