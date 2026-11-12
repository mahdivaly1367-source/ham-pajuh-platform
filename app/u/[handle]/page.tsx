"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type PublicProfile = {
  user: { name: string };
  profile: {
    handle: string;
    headline: string | null;
    bio: string | null;
    location: string | null;
    website: string | null;
  };
  stats: { publicProjects: number; recordedActivities: number };
  projects: Array<{
    id: string;
    slug: string;
    title: string;
    summary: string;
    status: string;
    updatedAt: string;
    discipline: string;
    role: string;
  }>;
};

export default function PublicProfilePage() {
  const params = useParams<{ handle: string }>();
  const handle = params.handle;
  const [data, setData] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/profiles/" + encodeURIComponent(handle), { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "پروفایل در دسترس نیست.");
        return payload as PublicProfile;
      })
      .then((payload) => { if (active) setData(payload); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "خطا در دریافت پروفایل.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [handle]);

  if (loading) return <main className="public-profile-page"><div className="profile-loading">در حال دریافت پروفایل پژوهشگر...</div></main>;

  if (!data) {
    return (
      <main className="public-profile-page">
        <div className="public-profile-empty">
          <span className="section-kicker">هم‌پژوه</span>
          <h1>این پروفایل در دسترس نیست</h1>
          <p>{error || "ممکن است پروفایل خصوصی شده یا نشانی آن اشتباه باشد."}</p>
          <Link className="primary-button" href="/">بازگشت به هم‌پژوه</Link>
        </div>
      </main>
    );
  }

  const initial = data.user.name.trim().slice(0, 1) || "پ";

  return (
    <main className="public-profile-page">
      <header className="public-profile-top">
        <Link className="brand" href="/">
          <span className="brand-symbol"><i /><i /><i /></span>
          <span className="brand-copy"><strong>هم‌پژوه</strong><small>شبکه علم و ساختن</small></span>
        </Link>
        <Link className="public-profile-back" href="/">کشف پروژه‌ها</Link>
      </header>

      <section className="public-profile-hero">
        <div className="public-profile-avatar">{initial}</div>
        <div className="public-profile-identity">
          <span className="public-profile-kicker">پروفایل عمومی پژوهشگر</span>
          <h1>{data.user.name}</h1>
          <div className="public-profile-handle" dir="ltr">@{data.profile.handle}</div>
          {data.profile.headline && <p className="public-profile-headline">{data.profile.headline}</p>}
          {data.profile.location && <span className="public-profile-location">{data.profile.location}</span>}
        </div>
        <div className="public-profile-stats">
          <div><strong>{data.stats.publicProjects.toLocaleString("fa-IR")}</strong><span>پروژه عمومی</span></div>
          <div><strong>{data.stats.recordedActivities.toLocaleString("fa-IR")}</strong><span>فعالیت ثبت‌شده</span></div>
        </div>
      </section>

      <div className="public-profile-content">
        <section className="public-profile-about">
          <div className="section-kicker">درباره پژوهشگر</div>
          <h2>مسیر و علایق حرفه‌ای</h2>
          <p>{data.profile.bio || "این پژوهشگر هنوز توضیحی درباره زمینه‌های فعالیت خود ننوشته است."}</p>
          {data.profile.website && <a className="public-profile-website" href={data.profile.website} target="_blank" rel="noreferrer">وب‌سایت و منابع بیشتر ↗</a>}
        </section>

        <section className="public-profile-projects">
          <div className="section-kicker">ردپای همکاری</div>
          <h2>پروژه‌ها و دستاوردهای عمومی</h2>
          {data.projects.length ? (
            <div className="public-project-list">
              {data.projects.map((project) => (
                <article className="public-project-card" key={project.id}>
                  <div><span className="public-project-discipline">{project.discipline}</span><h3><Link href={"/projects/" + encodeURIComponent(project.slug)}>{project.title}</Link></h3><p>{project.summary}</p></div>
                  <div className="public-project-meta"><span>{project.role === "owner" ? "بنیان‌گذار پروژه" : "عضو پروژه"}</span><span>{new Date(project.updatedAt).toLocaleDateString("fa-IR")}</span></div>
                </article>
              ))}
            </div>
          ) : (
            <div className="public-profile-empty-projects">هنوز پروژه عمومی‌ای برای نمایش ثبت نشده است.</div>
          )}
        </section>
      </div>
    </main>
  );
}
