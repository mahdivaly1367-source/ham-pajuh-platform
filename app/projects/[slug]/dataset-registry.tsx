"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Dataset = {
  id: string; title: string; description: string; dataFormat: string; license: string;
  doi: string; recordCount: number | null; variables: string[]; methodology: string;
  sourceReference: string; createdAt: string;
};
const emptyForm = { title: "", description: "", dataFormat: "CSV", license: "CC-BY-4.0", doi: "", recordCount: "", variables: "", methodology: "", sourceReference: "" };

export default function ProjectDatasetRegistry({ projectId }: { projectId: string }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/datasets`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "دریافت مجموعه‌داده‌ها انجام نشد.");
    setDatasets(payload.datasets ?? []);
  }, [projectId]);
  useEffect(() => { let active = true; load().catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [load]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/datasets`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form, recordCount: form.recordCount.trim() ? Number(form.recordCount) : null,
          variables: form.variables.split(/[,،\n]/).map((v) => v.trim()).filter(Boolean)
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "ثبت مجموعه‌داده انجام نشد.");
      setForm(emptyForm); setOpen(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "ارتباط با سرور برقرار نشد."); }
    finally { setSaving(false); }
  }
  return <section className="project-dataset-section">
    <header className="project-dataset-header">
      <div><span className="section-kicker">داده و شواهد پژوهش</span><h2>مجموعه‌داده‌های پروژه</h2><p>ثبت شناسنامه علمی داده‌ها، مستقل از محل نگهداری فایل اصلی.</p></div>
      <button type="button" className="primary-button" onClick={() => setOpen((v) => !v)}> {open ? "بستن فرم" : "ثبت مجموعه‌داده"} </button>
    </header>
    {error && <p className="project-dataset-error" role="alert">{error}</p>}
    {open && <form className="project-dataset-form" onSubmit={submit}>
      <label>عنوان مجموعه‌داده<input required minLength={3} maxLength={180} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label>توضیح<textarea maxLength={5000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <div className="project-dataset-form-grid">
        <label>قالب داده<input required maxLength={60} placeholder="CSV، JSON، NetCDF..." value={form.dataFormat} onChange={(e) => setForm({ ...form, dataFormat: e.target.value })} /></label>
        <label>مجوز استفاده<input maxLength={80} placeholder="CC-BY-4.0" value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value })} /></label>
        <label>شناسه DOI<input maxLength={120} dir="ltr" value={form.doi} onChange={(e) => setForm({ ...form, doi: e.target.value })} /></label>
        <label>تعداد رکورد<input type="number" min="0" step="1" value={form.recordCount} onChange={(e) => setForm({ ...form, recordCount: e.target.value })} /></label>
      </div>
      <label>متغیرها / ستون‌ها<input placeholder="temperature, pressure, ..." value={form.variables} onChange={(e) => setForm({ ...form, variables: e.target.value })} /></label>
      <label>روش گردآوری و آماده‌سازی<textarea maxLength={8000} value={form.methodology} onChange={(e) => setForm({ ...form, methodology: e.target.value })} /></label>
      <label>منبع یا نشانی مرجع<input maxLength={500} dir="ltr" value={form.sourceReference} onChange={(e) => setForm({ ...form, sourceReference: e.target.value })} /></label>
      <button className="primary-button" disabled={saving}>{saving ? "در حال ثبت..." : "ثبت فراداده"}</button>
    </form>}
    {loading ? <p className="project-empty-note">در حال دریافت اطلاعات...</p> : datasets.length ? <div className="project-dataset-grid">
      {datasets.map((item) => <article className="project-dataset-card" key={item.id}>
        <div className="project-dataset-card-top"><span>{item.dataFormat}</span><time>{new Date(item.createdAt).toLocaleDateString("fa-IR")}</time></div>
        <h3>{item.title}</h3><p>{item.description || "بدون توضیح"}</p>
        <dl><div><dt>تعداد رکورد</dt><dd>{item.recordCount === null ? "ثبت نشده" : item.recordCount.toLocaleString("fa-IR")}</dd></div><div><dt>مجوز</dt><dd>{item.license || "ثبت نشده"}</dd></div></dl>
        {!!item.variables?.length && <div className="project-dataset-tags">{item.variables.map((v) => <span key={v}>{v}</span>)}</div>}
        {item.doi && <small dir="ltr">DOI: {item.doi}</small>}
        {item.methodology && <details><summary>روش‌شناسی</summary><p>{item.methodology}</p></details>}
        {item.sourceReference && <a href={item.sourceReference} target="_blank" rel="noreferrer">مشاهده منبع</a>}
      </article>)}
    </div> : <div className="project-empty-note">هنوز مجموعه‌داده‌ای ثبت نشده است.</div>}
    <p className="project-dataset-footnote">در این مرحله فقط فراداده ثبت می‌شود؛ بارگذاری و نگهداری فایل داده در مرحله ذخیره‌سازی امن اضافه خواهد شد.</p>
  </section>;
}
