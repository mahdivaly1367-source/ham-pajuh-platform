"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
type TaskPriority = "low" | "normal" | "high" | "urgent";

type ProjectTask = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  createdBy: string;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type TeamMember = {
  userId: string;
  name: string;
  role: string;
};

type TaskBoardPayload = {
  tasks: ProjectTask[];
  members: TeamMember[];
  access: { role: string; currentUserId: string; canCreate: boolean };
};

const columns: Array<{ status: TaskStatus; label: string; note: string }> = [
  { status: "todo", label: "برای انجام", note: "در صف شروع" },
  { status: "in_progress", label: "در حال انجام", note: "کارهای فعال" },
  { status: "blocked", label: "متوقف / نیازمند پیگیری", note: "مانع یا وابستگی" },
  { status: "done", label: "انجام‌شده", note: "تکمیل‌شده‌ها" }
];

const statusLabels: Record<TaskStatus, string> = {
  todo: "برای انجام",
  in_progress: "در حال انجام",
  blocked: "متوقف",
  done: "انجام‌شده"
};

const priorityLabels: Record<TaskPriority, string> = {
  low: "کم",
  normal: "معمولی",
  high: "زیاد",
  urgent: "فوری"
};

export default function ProjectTaskBoard({
  projectId,
  onTaskChanged
}: {
  projectId: string;
  onTaskChanged: () => void;
}) {
  const [payload, setPayload] = useState<TaskBoardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingTask, setUpdatingTask] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "normal" as TaskPriority,
    assigneeId: "",
    dueDate: ""
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/projects/" + encodeURIComponent(projectId) + "/tasks", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error ?? "دریافت وظایف پروژه انجام نشد.");
        return result as TaskBoardPayload;
      })
      .then((result) => { if (active) setPayload(result); })
      .catch((reason: unknown) => {
        if (active) setNotice(reason instanceof Error ? reason.message : "خطا در دریافت وظایف.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  const grouped = useMemo(() => {
    const tasks = payload?.tasks ?? [];
    return Object.fromEntries(columns.map((column) => [
      column.status,
      tasks.filter((task) => task.status === column.status)
    ])) as Record<TaskStatus, ProjectTask[]>;
  }, [payload?.tasks]);

  const memberNames = useMemo(
    () => new Map((payload?.members ?? []).map((member) => [member.userId, member.name])),
    [payload?.members]
  );

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payload?.access.canCreate) return;
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/projects/" + encodeURIComponent(projectId) + "/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          priority: form.priority,
          assigneeId: form.assigneeId || null,
          dueDate: form.dueDate || null
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(result.error ?? "ثبت وظیفه انجام نشد.");
        return;
      }
      setPayload((current) => current ? {
        ...current,
        tasks: [result.task as ProjectTask, ...current.tasks]
      } : current);
      setForm({ title: "", description: "", priority: "normal", assigneeId: "", dueDate: "" });
      setFormOpen(false);
      setNotice("وظیفه به تابلوی پروژه اضافه شد.");
      onTaskChanged();
    } catch {
      setNotice("ارتباط با سرور برقرار نشد.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(task: ProjectTask, status: TaskStatus) {
    if (!payload) return;
    const isManager = ["owner", "maintainer"].includes(payload.access.role);
    const canChange = isManager || (
      payload.access.role === "contributor" &&
      (task.createdBy === payload.access.currentUserId || task.assigneeId === payload.access.currentUserId)
    );
    if (!canChange || task.status === status) return;

    setUpdatingTask(task.id);
    setNotice("");
    try {
      const response = await fetch(
        "/api/projects/" + encodeURIComponent(projectId) + "/tasks/" + encodeURIComponent(task.id),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status })
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(result.error ?? "تغییر وضعیت وظیفه انجام نشد.");
        return;
      }
      setPayload((current) => current ? {
        ...current,
        tasks: current.tasks.map((item) => item.id === task.id ? result.task as ProjectTask : item)
      } : current);
      onTaskChanged();
    } catch {
      setNotice("ارتباط با سرور برقرار نشد.");
    } finally {
      setUpdatingTask("");
    }
  }

  const isManager = payload ? ["owner", "maintainer"].includes(payload.access.role) : false;
  const availableAssignees = (payload?.members ?? []).filter((member) => member.role !== "viewer");

  return (
    <section className="project-task-section">
      <div className="project-task-header">
        <div>
          <span className="section-kicker">فضای همکاری تیم</span>
          <h2>تابلوی وظایف</h2>
          <p>کارهای پروژه را تقسیم کنید، مسئول هر کار را مشخص کنید و پیشرفت را ثبت کنید.</p>
        </div>
        {payload?.access.canCreate && (
          <button className="primary-button project-task-create-button" type="button" onClick={() => setFormOpen((open) => !open)}>
            {formOpen ? "بستن فرم" : "＋ وظیفه جدید"}
          </button>
        )}
      </div>

      {notice && <div className="project-task-notice" role="status">{notice}</div>}

      {formOpen && payload?.access.canCreate && (
        <form className="project-task-form" onSubmit={createTask}>
          <label>
            عنوان وظیفه
            <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required minLength={3} maxLength={180} placeholder="مثلاً: بررسی داده‌های آزمایش" />
          </label>
          <label>
            مسئول انجام
            <select value={form.assigneeId} onChange={(event) => setForm((current) => ({ ...current, assigneeId: event.target.value }))}>
              <option value="">بدون مسئول مشخص</option>
              {availableAssignees.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
            </select>
          </label>
          <label>
            اولویت
            <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as TaskPriority }))}>
              <option value="low">کم</option>
              <option value="normal">معمولی</option>
              <option value="high">زیاد</option>
              <option value="urgent">فوری</option>
            </select>
          </label>
          <label>
            مهلت انجام
            <input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} />
          </label>
          <label className="project-task-description-field">
            توضیحات
            <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={2} maxLength={5000} placeholder="شرح کوتاه کار، خروجی مورد انتظار یا وابستگی‌ها..." />
          </label>
          <div className="project-task-form-actions">
            <button className="secondary-button" type="button" onClick={() => setFormOpen(false)}>انصراف</button>
            <button className="primary-button" type="submit" disabled={saving || form.title.trim().length < 3}>
              {saving ? "در حال ثبت..." : "افزودن وظیفه"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="project-empty-note">در حال بارگذاری وظایف...</div>
      ) : !payload ? (
        <div className="project-empty-note">تابلوی وظایف در دسترس نیست؛ صفحه را دوباره بارگذاری کنید.</div>
      ) : (
        <div className="project-task-board">
          {columns.map((column) => {
            const tasks = grouped[column.status];
            return (
              <section className={"project-task-column status-" + column.status} key={column.status}>
                <header>
                  <div><strong>{column.label}</strong><small>{column.note}</small></div>
                  <span>{tasks.length.toLocaleString("fa-IR")}</span>
                </header>
                <div className="project-task-list">
                  {tasks.length === 0 ? (
                    <div className="project-task-empty">فعلاً کاری اینجا نیست.</div>
                  ) : tasks.map((task) => {
                    const isTaskParticipant = task.createdBy === payload.access.currentUserId || task.assigneeId === payload.access.currentUserId;
                    const canChange = isManager || (payload.access.role === "contributor" && isTaskParticipant);
                    return (
                      <article className="project-task-card" key={task.id}>
                        <div className="project-task-card-top">
                          <span className={"project-task-priority priority-" + task.priority}>{priorityLabels[task.priority]}</span>
                          {task.dueAt && <time dateTime={task.dueAt}>تا {new Date(task.dueAt).toLocaleDateString("fa-IR")}</time>}
                        </div>
                        <h3>{task.title}</h3>
                        {task.description && <p>{task.description}</p>}
                        <div className="project-task-card-footer">
                          <span>{task.assigneeId ? "مسئول: " + (memberNames.get(task.assigneeId) ?? "عضو تیم") : "بدون مسئول"}</span>
                          {canChange ? (
                            <select
                              aria-label={"وضعیت وظیفه " + task.title}
                              value={task.status}
                              disabled={updatingTask === task.id}
                              onChange={(event) => changeStatus(task, event.target.value as TaskStatus)}
                            >
                              {columns.map((item) => <option key={item.status} value={item.status}>{item.label}</option>)}
                            </select>
                          ) : <small>{statusLabels[task.status]}</small>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="project-task-footnote">
        {isManager
          ? "مدیران پروژه می‌توانند همه وظایف را مدیریت کنند."
          : "مشارکت‌کنندگان می‌توانند وضعیت کارهایی را که ایجاد کرده‌اند یا مسئول آن هستند تغییر دهند؛ مشاهده‌گران دسترسی فقط‌خواندنی دارند."}
      </div>
    </section>
  );
}
