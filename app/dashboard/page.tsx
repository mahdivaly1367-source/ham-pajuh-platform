"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Project = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: string;
  visibility: "public" | "private" | "unlisted";
  updatedAt: string;
  discipline: string;
  role: string;
};

type DashboardData = { projects: Project[]; total: number };

const statusLabels: Record<string, string> = {
  idea: "ایده اولیه",
  active: "در حال توسعه",
  paused: "متوقف موقت",
  completed: "تکمیل‌شده",
  archived: "بایگانی‌شده"
};

const roleLabels: Record<string, string> = {
  owner: "بنیان‌گذار",
  maintainer: "مدیر",
  contributor: "مشارکت‌کننده",
  viewer: "مشاهده‌گر"
};

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/my/projects", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/auth");
          return null;
        }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "دریافت پروژه‌ها انجام نشد.");
        return payload as DashboardData;
      })
      .then((payload) => { if (active && payload) setData(payload); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "خطا در دریافت فضای شخصی.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  const stats = useMemo(() => {
    const projects = data?.projects ?? [];
    return {
      total: projects.length,
      owned: projects.filter((item) => item.role === "owner").length,
      private: projects.filter((item) => item.visibility === "private").length,
      active: projects.filter((item) => item.status === "active").length
    };
  }, [data]);

  if (loading) return <main className="dashboard-page"><div className="profile-loading">در حال بارگذاری فضای شخصی...</div></main>;

  if (!data) {
    return <main className="dashboard-page"><div className="dashboard-error"><h1>فضای پروژه‌ها در دسترس نیست</h1><p>{error}</p><Link className="primary-button" href="/">بازگشت به هم‌پژوه</Link></div></main>;
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-top">
        <Link className="brand" href="/">
          <span className="brand-symbol"><i /><i /><i /></span>
          <span className="brand-copy"><strong>هم‌پژوه</strong><small>شبکه علم و ساختن</small></span>
        </Link>
        <div className="dashboard-top-actions">
          <Link href="/profile">پروفایل من</Link>
          <Link href="/">کشف پروژه‌ها</Link>
        </div>
      </header>

      <section className="dashboard-heading">
        <div>
          <div className="section-kicker">فضای کاری شخصی</div>
          <h1>پروژه‌های من</h1>
          <p>پروژه‌هایی که ساخته‌ای یا به‌عنوان عضو در آن‌ها مشارکت داری؛ عمومی و خصوصی، همه در یک‌جا.</p>
        </div>
        <Link className="primary-button" href="/">کشف و ساخت پروژه <span>←</span></Link>
      </section>

      <section className="dashboard-stats">
        <div><strong>{stats.total.toLocaleString("fa-IR")}</strong><span>پروژه در فضای من</span></div>
        <div><strong>{stats.owned.toLocaleString("fa-IR")}</strong><span>پروژه بنیان‌گذاری‌شده</span></div>
        <div><strong>{stats.private.toLocaleString("fa-IR")}</strong><span>پروژه خصوصی</span></div>
        <div><strong>{stats.active.toLocaleString("fa-IR")}</strong><span>در حال توسعه</span></div>
      </section>

      <section className="dashboard-projects">
        <div className="dashboard-section-heading">
          <div><div className="section-kicker">فضاهای قابل دسترسی</div><h2>فهرست پروژه‌ها</h2></div>
          <span>{stats.total.toLocaleString("fa-IR")} مورد</span>
        </div>

        {data.projects.length ? (
          <div className="dashboard-project-grid">
            {data.projects.map((project) => (
              <article className="dashboard-project-card" key={project.id}>
                <div className="dashboard-card-top">
                  <span className="project-discipline mint">{project.discipline}</span>
                  <span className={project.visibility === "private" ? "dashboard-private" : "dashboard-public"}>
                    {project.visibility === "private" ? "خصوصی" : project.visibility === "unlisted" ? "دارای پیوند" : "عمومی"}
                  </span>
                </div>
                <h3><Link href={"/projects/" + encodeURIComponent(project.slug)}>{project.title}</Link></h3>
                <p>{project.summary}</p>
                <div className="dashboard-card-meta">
                  <span>{roleLabels[project.role] ?? project.role}</span>
                  <span>{statusLabels[project.status] ?? project.status}</span>
                  <span>{new Date(project.updatedAt).toLocaleDateString("fa-IR")}</span>
                </div>
                <Link className="dashboard-open" href={"/projects/" + encodeURIComponent(project.slug)}>ورود به فضای پروژه ←</Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="dashboard-empty">
            <span className="starter-icon">＋</span>
            <h2>هنوز عضو پروژه‌ای نیستی</h2>
            <p>یک پروژه بساز یا برای همکاری در پروژه‌های عمومی درخواست بفرست.</p>
            <Link className="primary-button" href="/">رفتن به کشف پروژه‌ها</Link>
          </div>
        )}
      </section>
    </main>
  );
}
