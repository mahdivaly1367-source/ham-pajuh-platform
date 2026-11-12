"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type ProjectDetail = {
  project: {
    id: string;
    slug: string;
    title: string;
    summary: string;
    description: string;
    visibility: "public" | "private" | "unlisted";
    status: string;
    createdAt: string;
    updatedAt: string;
    discipline: string;
    ownerName: string;
    ownerHandle: string | null;
  };
  members: Array<{
    name: string;
    handle: string | null;
    role: string;
    joinedAt: string;
  }>;
  access: { isMember: boolean; role: string | null; canManage: boolean; canEdit: boolean };
};

type CollaborationRequest = {
  id: string;
  message: string;
  status: string;
  createdAt: string;
  userName: string;
  userHandle: string | null;
};

const statusLabels: Record<string, string> = {
  idea: "ایده اولیه",
  active: "در حال توسعه",
  paused: "متوقف موقت",
  completed: "تکمیل‌شده",
  archived: "بایگانی‌شده"
};

const roleLabels: Record<string, string> = {
  owner: "بنیان‌گذار",
  maintainer: "مدیر پروژه",
  contributor: "مشارکت‌کننده",
  viewer: "مشاهده‌گر"
};

export default function ProjectDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [requests, setRequests] = useState<CollaborationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestLoading, setRequestLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", summary: "", description: "", visibility: "private", status: "idea" });

  const loadProject = useCallback(async () => {
    const response = await fetch("/api/projects/by-slug/" + encodeURIComponent(slug), { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "پروژه در دسترس نیست.");
    return payload as ProjectDetail;
  }, [slug]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    loadProject()
      .then((payload) => {
        if (active) {
          setData(payload);
          setEditForm({
            title: payload.project.title,
            summary: payload.project.summary,
            description: payload.project.description ?? "",
            visibility: payload.project.visibility,
            status: payload.project.status
          });
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "خطا در دریافت پروژه.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadProject, refreshKey]);

  useEffect(() => {
    if (!data?.access.canManage) {
      setRequests([]);
      return;
    }

    let active = true;
    fetch("/api/projects/" + encodeURIComponent(data.project.id) + "/requests", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "دریافت درخواست‌ها انجام نشد.");
        return payload.requests as CollaborationRequest[];
      })
      .then((items) => { if (active) setRequests(items); })
      .catch((reason: unknown) => {
        if (active) setNotice(reason instanceof Error ? reason.message : "خطا در دریافت درخواست‌ها.");
      });
    return () => { active = false; };
  }, [data]);

  async function requestToJoin() {
    if (!data) return;
    setRequestLoading(true);
    setNotice("");
    try {
      const response = await fetch("/api/projects/" + encodeURIComponent(data.project.id) + "/join", {
        method: "POST"
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        router.push("/auth");
        return;
      }
      if (!response.ok && response.status !== 409) {
        setNotice(payload.error ?? "ثبت درخواست همکاری انجام نشد.");
        return;
      }
      setNotice(payload.message ?? "درخواست همکاری ثبت شد.");
    } catch {
      setNotice("ارتباط با سرور برقرار نشد.");
    } finally {
      setRequestLoading(false);
    }
  }

  async function reviewRequest(requestId: string, action: "accept" | "decline") {
    if (!data) return;
    setReviewingId(requestId);
    setNotice("");
    try {
      const response = await fetch(
        "/api/projects/" + encodeURIComponent(data.project.id) + "/requests/" + encodeURIComponent(requestId),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action })
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? "بررسی درخواست انجام نشد.");
        return;
      }
      setNotice(payload.message ?? "درخواست بررسی شد.");
      setRequests((current) => current.filter((item) => item.id !== requestId));
      if (action === "accept") setRefreshKey((value) => value + 1);
    } catch {
      setNotice("ارتباط با سرور برقرار نشد.");
    } finally {
      setReviewingId("");
    }
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    setSavingEdit(true);
    setNotice("");
    try {
      const response = await fetch("/api/projects/" + encodeURIComponent(data.project.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? "ذخیره تغییرات پروژه انجام نشد.");
        return;
      }
      setNotice("مشخصات پروژه به‌روزرسانی شد.");
      setEditOpen(false);
      setRefreshKey((value) => value + 1);
    } catch {
      setNotice("ارتباط با سرور برقرار نشد.");
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) {
    return <main className="project-detail-page"><div className="profile-loading">در حال بارگذاری فضای پروژه...</div></main>;
  }

  if (!data) {
    return (
      <main className="project-detail-page">
        <section className="project-detail-error">
          <span className="section-kicker">فضای پروژه</span>
          <h1>این پروژه در دسترس نیست</h1>
          <p>{error || "نشانی پروژه اشتباه است یا اجازه مشاهده آن را نداری."}</p>
          <Link href="/" className="primary-button">بازگشت به کشف پروژه‌ها</Link>
        </section>
      </main>
    );
  }

  const { project, members, access } = data;

  return (
    <main className="project-detail-page">
      <header className="project-detail-top">
        <Link className="brand" href="/">
          <span className="brand-symbol"><i /><i /><i /></span>
          <span className="brand-copy"><strong>هم‌پژوه</strong><small>شبکه علم و ساختن</small></span>
        </Link>
        <Link className="project-detail-back" href="/">بازگشت به کشف پروژه‌ها</Link>
      </header>

      <section className="project-detail-hero">
        <div className="project-detail-topline">
          <span className="project-discipline mint">{project.discipline}</span>
          <div>
            <span className="project-detail-status">{statusLabels[project.status] ?? project.status}</span>
            <span className="project-detail-visibility">
              {project.visibility === "public" ? "عمومی" : project.visibility === "private" ? "خصوصی" : "دارای پیوند"}
            </span>
          </div>
        </div>
        <h1>{project.title}</h1>
        <p className="project-detail-summary">{project.summary}</p>
        <div className="project-detail-meta">
          <span>بنیان‌گذار: {project.ownerHandle ? <Link href={"/u/" + encodeURIComponent(project.ownerHandle)}>{project.ownerName}</Link> : project.ownerName}</span>
          <span>{members.length.toLocaleString("fa-IR")} عضو</span>
          <span>آخرین به‌روزرسانی: {new Date(project.updatedAt).toLocaleDateString("fa-IR")}</span>
        </div>
        {access.canEdit && <div className="project-detail-actions"><button className="secondary-button" type="button" onClick={() => setEditOpen((open) => !open)}>{editOpen ? "بستن ویرایش" : "ویرایش مشخصات پروژه"}</button></div>}
        {project.visibility !== "private" && !access.isMember && (
          <div className="project-detail-actions">
            <button className="primary-button" type="button" disabled={requestLoading} onClick={requestToJoin}>
              {requestLoading ? "در حال ارسال..." : "درخواست همکاری"}
            </button>
          </div>
        )}
      </section>

      {notice && <div className="profile-message" role="status" style={{ maxWidth: 1120, margin: "14px auto 0" }}>{notice}</div>}

      {editOpen && access.canEdit && (
        <section className="project-edit-panel">
          <div className="section-kicker">تنظیمات پروژه</div>
          <h2>ویرایش مشخصات و دسترسی</h2>
          <form className="project-edit-form" onSubmit={saveProject}>
            <label>عنوان پروژه<input value={editForm.title} onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))} minLength={5} maxLength={100} required /></label>
            <label>خلاصه پروژه<textarea value={editForm.summary} onChange={(event) => setEditForm((current) => ({ ...current, summary: event.target.value }))} minLength={20} maxLength={280} rows={2} required /></label>
            <label>توضیحات کامل<textarea value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} maxLength={12000} rows={5} /></label>
            <div className="project-edit-selects">
              <label>وضعیت<select value={editForm.status} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))}><option value="idea">ایده اولیه</option><option value="active">در حال توسعه</option><option value="paused">متوقف موقت</option><option value="completed">تکمیل‌شده</option><option value="archived">بایگانی‌شده</option></select></label>
              <label>سطح دسترسی<select value={editForm.visibility} onChange={(event) => setEditForm((current) => ({ ...current, visibility: event.target.value }))}><option value="private">خصوصی</option><option value="public">عمومی</option><option value="unlisted">دارای پیوند</option></select></label>
            </div>
            <div className="project-edit-warning">پروژه خصوصی فقط برای اعضای آن قابل مشاهده است. پروژه دارای پیوند در فهرست عمومی دیده نمی‌شود اما با نشانی مستقیم قابل دسترسی است.</div>
            <div className="project-edit-actions"><button type="button" className="secondary-button" onClick={() => setEditOpen(false)}>انصراف</button><button type="submit" className="primary-button" disabled={savingEdit}>{savingEdit ? "در حال ذخیره..." : "ذخیره تغییرات"}</button></div>
          </form>
        </section>
      )}

      <div className="project-detail-content">
        <section className="project-detail-main">
          <div className="section-kicker">معرفی و مستندات</div>
          <h2>درباره این پروژه</h2>
          <div className="project-description">{project.description || project.summary}</div>
        </section>

        <aside className="project-detail-sidebar">
          <div className="section-kicker">تیم پروژه</div>
          <h2>مشارکت‌کنندگان ({members.length.toLocaleString("fa-IR")})</h2>
          <div className="project-member-list">
            {members.map((member, index) => (
              <div className="project-member-row" key={member.handle ?? member.name + index}>
                <span className="project-member-avatar">{member.name.trim().slice(0, 1) || "پ"}</span>
                <span className="project-member-name">
                  {member.handle ? <Link href={"/u/" + encodeURIComponent(member.handle)}>{member.name}</Link> : member.name}
                  <small>{new Date(member.joinedAt).toLocaleDateString("fa-IR")}</small>
                </span>
                <span className="project-member-role">{roleLabels[member.role] ?? member.role}</span>
              </div>
            ))}
          </div>

          {access.canManage && (
            <div className="project-request-panel">
              <div className="section-kicker">مدیریت مشارکت</div>
              <h2>درخواست‌های همکاری ({requests.length.toLocaleString("fa-IR")})</h2>
              {requests.length === 0 ? (
                <div className="project-empty-note">درخواست معلقی وجود ندارد. درخواست‌های جدید در همین بخش نمایش داده می‌شوند.</div>
              ) : requests.map((item) => (
                <div className="project-request-item" key={item.id}>
                  <strong>{item.userHandle ? <Link href={"/u/" + encodeURIComponent(item.userHandle)}>{item.userName}</Link> : item.userName}</strong>
                  <p>{item.message || "درخواست عضویت در این پروژه"}</p>
                  <div className="project-request-actions">
                    <button className="project-request-accept" type="button" disabled={reviewingId === item.id} onClick={() => reviewRequest(item.id, "accept")}>پذیرش</button>
                    <button className="project-request-decline" type="button" disabled={reviewingId === item.id} onClick={() => reviewRequest(item.id, "decline")}>رد درخواست</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
