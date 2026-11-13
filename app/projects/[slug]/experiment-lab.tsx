"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type DatasetOption = { id: string; title: string };
type Experiment = {
  id: string;
  title: string;
  datasetId: string | null;
  objective: string;
  hypothesis: string;
  protocol: string;
  materials: string[];
  variables: string[];
  controls: string;
  procedure: string;
  observations: string;
  conclusion: string;
  status: "planned" | "in_progress" | "completed" | "abandoned";
  createdAt: string;
  updatedAt: string;
};
type ExperimentEntry = { experiment: Experiment; datasetTitle: string | null };
type ExperimentForm = {
  title: string; datasetId: string; status: Experiment["status"];
  objective: string; hypothesis: string; protocol: string;
  materials: string; variables: string; controls: string;
  procedure: string; observations: string; conclusion: string;
};
const emptyForm: ExperimentForm = {
  title: "", datasetId: "", status: "planned", objective: "", hypothesis: "",
  protocol: "", materials: "", variables: "", controls: "",
  procedure: "", observations: "", conclusion: ""
};
const statusLabels: Record<Experiment["status"], string> = {
  planned: "برنامه‌ریزی‌شده",
  in_progress: "در حال اجرا",
  completed: "تکمیل‌شده",
  abandoned: "متوقف‌شده"
};
function splitItems(value: string) {
  return value.split(/[,،\n]/).map((item) => item.trim()).filter(Boolean);
}

export default function ProjectExperimentLab({ projectId }: { projectId: string }) {
  const [entries, setEntries] = useState<ExperimentEntry[]>([]);
  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [form, setForm] = useState<ExperimentForm>(emptyForm);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const base = `/api/projects/${encodeURIComponent(projectId)}`;
    const [experimentResponse, datasetResponse] = await Promise.all([
      fetch(`${base}/experiments`, { cache: "no-store" }),
      fetch(`${base}/datasets`, { cache: "no-store" })
    ]);
    const [experimentPayload, datasetPayload] = await Promise.all([
      experimentResponse.json().catch(() => ({})),
      datasetResponse.json().catch(() => ({}))
    ]);
    if (!experimentResponse.ok) throw new Error(experimentPayload.error ?? "دریافت دفتر آزمایش انجام نشد.");
    if (!datasetResponse.ok) throw new Error(datasetPayload.error ?? "دریافت مجموعه‌داده‌ها انجام نشد.");
    setEntries(experimentPayload.experiments ?? []);
    setDatasets((datasetPayload.datasets ?? []).map((item: DatasetOption) => ({ id: item.id, title: item.title })));
  }, [projectId]);

  useEffect(() => {
    let active = true;
    load().catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "خطا در دریافت اطلاعات."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const endpoint = `/api/projects/${encodeURIComponent(projectId)}/experiments`;
      const response = await fetch(editingId ? `${endpoint}/${encodeURIComponent(editingId)}` : endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          datasetId: form.datasetId || null,
          materials: splitItems(form.materials),
          variables: splitItems(form.variables)
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "ثبت آزمایش انجام نشد.");
      setForm(emptyForm);
      setEditingId(null);
      setOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ارتباط با سرور برقرار نشد.");
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(experiment: Experiment) {
    setEditingId(experiment.id);
    setForm({
      title: experiment.title, datasetId: experiment.datasetId ?? "", status: experiment.status,
      objective: experiment.objective, hypothesis: experiment.hypothesis, protocol: experiment.protocol,
      materials: experiment.materials.join("، "), variables: experiment.variables.join("، "),
      controls: experiment.controls, procedure: experiment.procedure,
      observations: experiment.observations, conclusion: experiment.conclusion
    });
    setOpen(true);
    setError("");
  }

  function closeForm() {
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  return <section className="project-experiment-section">
    <header className="project-experiment-header">
      <div>
        <span className="section-kicker">روش علمی و ثبت نتایج</span>
        <h2>دفتر آزمایش و پروتکل پژوهش</h2>
        <p>فرضیه، روش اجرا، متغیرها و مشاهدات را به‌صورت ساخت‌یافته ثبت کنید.</p>
      </div>
      <button type="button" className="primary-button" onClick={() => open ? closeForm() : (setEditingId(null), setForm(emptyForm), setOpen(true))}>
        {open ? "بستن فرم" : "ثبت آزمایش جدید"}
      </button>
    </header>

    {error && <p className="project-experiment-error" role="alert">{error}</p>}

    {open && <form className="project-experiment-form" onSubmit={submit}>
      <div className="project-experiment-form-grid">
        <label>عنوان آزمایش<input required minLength={3} maxLength={180} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label>وضعیت<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Experiment["status"] })}>
          <option value="planned">برنامه‌ریزی‌شده</option><option value="in_progress">در حال اجرا</option>
          <option value="completed">تکمیل‌شده</option><option value="abandoned">متوقف‌شده</option>
        </select></label>
        <label>مجموعه‌داده مرتبط<select value={form.datasetId} onChange={(event) => setForm({ ...form, datasetId: event.target.value })}>
          <option value="">بدون پیوند به مجموعه‌داده</option>
          {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.title}</option>)}
        </select></label>
      </div>
      <label>هدف آزمایش<textarea maxLength={8000} value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} /></label>
      <label>فرضیه<textarea maxLength={8000} value={form.hypothesis} onChange={(event) => setForm({ ...form, hypothesis: event.target.value })} /></label>
      <label>پروتکل / روش‌شناسی<textarea maxLength={12000} value={form.protocol} onChange={(event) => setForm({ ...form, protocol: event.target.value })} /></label>
      <div className="project-experiment-form-grid">
        <label>مواد و تجهیزات<textarea placeholder="هر مورد را با ویرگول یا خط جدید جدا کنید." value={form.materials} onChange={(event) => setForm({ ...form, materials: event.target.value })} /></label>
        <label>متغیرها<textarea placeholder="مستقل، وابسته و..." value={form.variables} onChange={(event) => setForm({ ...form, variables: event.target.value })} /></label>
      </div>
      <label>گروه کنترل و شرایط ثابت<textarea maxLength={8000} value={form.controls} onChange={(event) => setForm({ ...form, controls: event.target.value })} /></label>
      <label>مراحل اجرا<textarea maxLength={20000} value={form.procedure} onChange={(event) => setForm({ ...form, procedure: event.target.value })} /></label>
      <label>مشاهدات و داده‌های به‌دست‌آمده<textarea maxLength={20000} value={form.observations} onChange={(event) => setForm({ ...form, observations: event.target.value })} /></label>
      <label>نتیجه‌گیری<textarea maxLength={12000} value={form.conclusion} onChange={(event) => setForm({ ...form, conclusion: event.target.value })} /></label>
      <div className="project-experiment-form-actions">
        <span>{editingId ? "ویرایش در تاریخچه فعالیت پروژه ثبت می‌شود." : "پس از ثبت، رکورد در تاریخچه فعالیت پروژه نیز ثبت می‌شود."}</span>
        <button className="primary-button" disabled={saving}>{saving ? "در حال ذخیره..." : editingId ? "ذخیره تغییرات" : "ثبت در دفتر آزمایش"}</button>
      </div>
    </form>}

    {loading ? <p className="project-empty-note">در حال دریافت آزمایش‌ها...</p> : entries.length ? (
      <div className="project-experiment-list">
        {entries.map(({ experiment, datasetTitle }) => <article className="project-experiment-card" key={experiment.id}>
          <div className="project-experiment-card-top">
            <span className={`project-experiment-status status-${experiment.status}`}>{statusLabels[experiment.status]}</span>
            <time>{new Date(experiment.createdAt).toLocaleDateString("fa-IR")}</time>
          </div>
          <div className="project-experiment-card-heading">
            <h3>{experiment.title}</h3>
            <button type="button" className="secondary-button" onClick={() => beginEdit(experiment)}>ویرایش آزمایش</button>
          </div>
          {datasetTitle && <p className="project-experiment-dataset">مجموعه‌داده مرتبط: {datasetTitle}</p>}
          {experiment.objective && <div className="project-experiment-summary"><strong>هدف</strong><p>{experiment.objective}</p></div>}
          {experiment.hypothesis && <div className="project-experiment-summary"><strong>فرضیه</strong><p>{experiment.hypothesis}</p></div>}
          <details>
            <summary>مشاهده جزئیات پروتکل و نتایج</summary>
            <div className="project-experiment-detail-grid">
              {experiment.protocol && <div><strong>روش‌شناسی</strong><p>{experiment.protocol}</p></div>}
              {!!experiment.materials?.length && <div><strong>مواد و تجهیزات</strong><p>{experiment.materials.join("، ")}</p></div>}
              {!!experiment.variables?.length && <div><strong>متغیرها</strong><p>{experiment.variables.join("، ")}</p></div>}
              {experiment.controls && <div><strong>کنترل‌ها</strong><p>{experiment.controls}</p></div>}
              {experiment.procedure && <div><strong>مراحل اجرا</strong><p>{experiment.procedure}</p></div>}
              {experiment.observations && <div><strong>مشاهدات</strong><p>{experiment.observations}</p></div>}
              {experiment.conclusion && <div><strong>نتیجه‌گیری</strong><p>{experiment.conclusion}</p></div>}
            </div>
          </details>
        </article>)}
      </div>
    ) : <div className="project-empty-note">هنوز آزمایشی در این پروژه ثبت نشده است.</div>}
    <p className="project-experiment-footnote">ثبت پروتکل یا نتیجه در این دفتر، به‌تنهایی به معنای بازتولیدپذیری یا تأیید علمی مستقل آن نیست.</p>
  </section>;
}
