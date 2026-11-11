"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type Profile = {
  handle: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  isPublic: boolean;
};

type ProfilePayload = {
  user: { name: string; email: string };
  profile: Profile;
};

export default function ProfilePage() {
  const router = useRouter();
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [form, setForm] = useState({
    handle: "",
    headline: "",
    bio: "",
    location: "",
    website: "",
    isPublic: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/profile", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/auth");
          return null;
        }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "بارگذاری پروفایل انجام نشد.");
        return payload as ProfilePayload;
      })
      .then((payload) => {
        if (!active || !payload) return;
        setData(payload);
        setForm({
          handle: payload.profile.handle ?? "",
          headline: payload.profile.headline ?? "",
          bio: payload.profile.bio ?? "",
          location: payload.profile.location ?? "",
          website: payload.profile.website ?? "",
          isPublic: payload.profile.isPublic
        });
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(true);
          setMessage(reason instanceof Error ? reason.message : "خطا در دریافت پروفایل.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [router]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(false);
    setMessage("");

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        router.replace("/auth");
        return;
      }
      if (!response.ok) {
        setError(true);
        setMessage(payload.error ?? "ذخیره پروفایل انجام نشد.");
        return;
      }
      setData((current) => current ? { ...current, profile: payload.profile } : current);
      setMessage("تغییرات پروفایل ذخیره شد.");
    } catch {
      setError(true);
      setMessage("ارتباط با سرور برقرار نشد.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="profile-page"><div className="profile-loading">در حال بارگذاری فضای شخصی...</div></main>;
  }

  if (!data) {
    return <main className="profile-page"><div className="profile-loading">{message || "پروفایل در دسترس نیست."}</div></main>;
  }

  return (
    <main className="profile-page">
      <div className="profile-topline">
        <Link className="brand" href="/">
          <span className="brand-symbol"><i /><i /><i /></span>
          <span className="brand-copy"><strong>هم‌پژوه</strong><small>شبکه علم و ساختن</small></span>
        </Link>
        <Link className="profile-back" href="/">بازگشت به کشف پروژه‌ها</Link>
      </div>

      <div className="profile-layout">
        <aside className="profile-side">
          <div className="profile-avatar">{data.user.name.trim().slice(0, 1) || "پ"}</div>
          <h1>{data.user.name}</h1>
          <p dir="ltr">{data.user.email}</p>
          <span className="profile-handle">@{form.handle || data.profile.handle}</span>
          <div className="profile-tip">
            پروفایل عمومی پایه رزومه علمی و فنی تو است. در مرحله‌های بعد پروژه‌ها، مشارکت‌ها، مهارت‌ها و آثار قابل استناد به آن متصل می‌شوند.
          </div>
        </aside>

        <section className="profile-form-card">
          <div className="profile-form-heading">
            <div>
              <div className="section-kicker">هویت حرفه‌ای</div>
              <h2>پروفایل پژوهشگر</h2>
              <p>اطلاعاتی را وارد کن که دیگران برای شناخت تخصص و مسیر کاری‌ات نیاز دارند.</p>
            </div>
          </div>

          <form className="profile-form" onSubmit={saveProfile}>
            <label>
              شناسه عمومی
              <input
                value={form.handle}
                onChange={(event) => setForm((current) => ({ ...current, handle: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                required minLength={3} maxLength={40} pattern="[a-z0-9][a-z0-9-]*"
                dir="ltr" className="ltr-input" placeholder="your-researcher-id"
              />
              <span className="field-hint">فقط حروف انگلیسی کوچک، عدد و خط تیره؛ این شناسه نشانی عمومی پروفایل خواهد بود.</span>
            </label>
            <label>
              عنوان تخصصی
              <input value={form.headline} onChange={(event) => setForm((current) => ({ ...current, headline: event.target.value }))} maxLength={160} placeholder="مثلاً پژوهشگر هوش مصنوعی، مهندس مکانیک..." />
            </label>
            <label>
              درباره من
              <textarea value={form.bio} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} rows={5} maxLength={2000} placeholder="زمینه‌های علاقه، تجربه‌ها و مسئله‌هایی که روی آن‌ها کار می‌کنی..." />
            </label>
            <label>
              محل فعالیت
              <input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} maxLength={120} placeholder="شهر، کشور یا نام آزمایشگاه" />
            </label>
            <label>
              وب‌سایت یا صفحه حرفه‌ای
              <input value={form.website} onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))} type="url" maxLength={500} dir="ltr" className="ltr-input" placeholder="https://example.com" />
            </label>

            <div className="profile-visibility">
              <div><strong>نمایش عمومی پروفایل</strong><p>با غیرفعال‌کردن این گزینه، پروفایل از دسترس عمومی خارج می‌شود.</p></div>
              <label className="profile-switch"><input type="checkbox" checked={form.isPublic} onChange={(event) => setForm((current) => ({ ...current, isPublic: event.target.checked }))} /> عمومی</label>
            </div>

            {message && <div className={error ? "profile-message error" : "profile-message"} role="status">{message}</div>}
            <div className="profile-save-row">
              <span className="field-hint">اطلاعات فقط پس از فشردن دکمه ذخیره می‌شوند.</span>
              <button className="profile-save" type="submit" disabled={saving}>{saving ? "در حال ذخیره..." : "ذخیره پروفایل"}</button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
