"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type TaskStatus = "todo" | "in_progress" | "blocked" | "in_review" | "changes_requested" | "done";
type TaskPriority = "low" | "normal" | "high" | "urgent";
type ReviewAction = "submit_for_review" | "approve" | "request_changes";

type ProjectTask = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  createdBy: string;
  dueAt: string | null;
  reviewRequestedAt: string | null;
  reviewSubmittedBy: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewComment: string;
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
  { status: "blocked", label: "متوقف", note: "نیازمند پیگیری" },
  { status: "in_review", label: "در انتظار بررسی", note: "ارسال‌شده برای تأیید" },
  { status: "changes_requested", label: "نیازمند اصلاح", note: "بازگشت از بررسی" },
  { status: "done", label: "تأییدشده", note: "تکمیل نهایی" }
];

const statusLabels: Record<TaskStatus, string> = {
  todo: "برای انجام",
  in_progress: "در حال انجام",
  blocked: "متوقف",
  in_review: "در انتظار بررسی",
  changes_requested: "نیازمند اصلاح",
  done: "تأییدشده"
};

const priorityLabels: Record<TaskPriority, string> = {
  low: "کم",
  normal: "معمولی",
  high: "زیاد",
  urgent: "فوری"
};

const workingStatuses: Array<"todo" | "in_progress" | "blocked"> = ["todo", "in_progress", "blocked"];

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });
}

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
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
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

  async function changeStatus(task: ProjectTask, status: "todo" | "in_progress" | "blocked") {
    await mutateTask(task, { status });
  }

  async function reviewTask(task: ProjectTask, action: ReviewAction) {
    const comment = reviewComments[task.id]?.trim() ?? "";
    if (action === "request_changes" && comment.length < 3) {
      setNotice("برای درخواست اصلاح، توضیحی دست‌کم سه‌نویسه‌ای بنویسید.");
      return;
    }
    await mutateTask(task, { action, ...(comment ? { comment } : {}) });
    if (action !== "submit_for_review") {
      setReviewComments((current) => ({ ...current, [task.id]: "" }));
    }
  }

  async function mutateTask(task: ProjectTask, body: Record<string, string>) {
    if (!payload) return;
    setUpdatingTask(task.id);
    setNotice("");
    try {
      const response = await fetch(
        "/api/projects/" + encodeURIComponent(projectId) + "/tasks/" + encodeURIComponent(task.id),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(result.error ?? "به‌روزرسانی وظیفه انجام نشد.");
        return;
      }
      setPayload((current) => current ? {
        ...current,
        tasks: current.tasks.map((item) => item.id === task.id ? result.task as ProjectTask : item)
      } : current);
      const messages: Record<string, string> = {
        submit_for_review: "وظیفه برای بررسی مدیران ارسال شد.",
        approve: "وظیفه تأیید و تکمیل شد.",
        request_changes: "درخواست اصلاح برای مسئول وظیفه ارسال شد."
      };
      setNotice("action" in body ? messages[body.action] ?? "وضعیت وظیفه به‌روزرسانی شد." : "وضعیت وظیفه به‌روزرسانی شد.");
      onTaskChanged();
    } catch {
      setNotice("ارتباط با سرور برقرار نشد.");
    } finally {
      setUpdatingTask("");
    }
  }

  const isManager = payload ? ["owner", "maintainer"].includes(payload.access.role) : false;
  const availableAssignees = (payload?.members ?? []).filter((member) => member.role !== "viewer");
  const currentUserId = payload?.access.currentUserId;

  return (
    <section className="project-task-section">
      <div className="project-task-header">
        <div>
          <span className="section-kicker">فضای همکاری تیم</span>
          <h2>تابلوی وظایف و تأیید دستاورد</h2>
          <p>هر کار از اجرا به بررسی مدیران می‌رود و پس از تأیید، تکمیل نهایی می‌شود.</p>
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
            <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={2} maxLength={5000} placeholder="شرح کار، خروجی مورد انتظار یا معیار پذیرش..." />
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
                    const isTaskParticipant = task.createdBy === currentUserId || task.assigneeId === currentUserId;
                    const canChangeStatus = isManager || (payload.access.role === "contributor" && isTaskParticipant && task.status !== "done");
                    const canSubmit = payload.access.role !== "viewer" && isTaskParticipant &&
                      ["todo", "in_progress", "blocked", "changes_requested"].includes(task.status);
                    const selfSubmitted = task.reviewSubmittedBy === currentUserId;
                    const reviewerName = task.reviewedBy ? memberNames.get(task.reviewedBy) ?? "مدیر پروژه" : "مدیر پروژه";
                    const submitterName = task.reviewSubmittedBy ? memberNames.get(task.reviewSubmittedBy) ?? "عضو تیم" : "عضو تیم";

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
                          {task.status === "in_review"
                            ? <small>در حال بررسی مدیران</small>
                            : canChangeStatus ? (
                              <select
                                aria-label={"وضعیت وظیفه " + task.title}
                                value={task.status}
                                disabled={updatingTask === task.id}
                                onChange={(event) => changeStatus(task, event.target.value as "todo" | "in_progress" | "blocked")}
                              >
                                {!workingStatuses.includes(task.status as "todo" | "in_progress" | "blocked") && (
                                  <option value={task.status} disabled>{statusLabels[task.status]}</option>
                                )}
                                {workingStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                              </select>
                            ) : <small>{statusLabels[task.status]}</small>}
                        </div>

                        {task.status === "in_review" && (
                          <div className="project-task-review-meta">
                            <strong>در صف تأیید نهایی</strong>
                            <span>ارسال‌کننده: {submitterName}</span>
                            {task.reviewRequestedAt && <time dateTime={task.reviewRequestedAt}>{formatDate(task.reviewRequestedAt)}</time>}
                            {isManager && (selfSubmitted
                              ? <p className="project-task-review-warning">ارسال‌کننده نمی‌تواند بررسی‌کننده همین مرحله باشد؛ مدیر دیگری باید تصمیم بگیرد.</p>
                              : (
                                <div className="project-task-review-actions">
                                  <textarea
                                    value={reviewComments[task.id] ?? ""}
                                    onChange={(event) => setReviewComments((current) => ({ ...current, [task.id]: event.target.value }))}
                                    rows={2}
                                    maxLength={2000}
                                    placeholder="یادداشت بررسی؛ برای درخواست اصلاح، نوشتن توضیح الزامی است."
                                  />
                                  <div>
                                    <button type="button" className="secondary-button" disabled={updatingTask === task.id || (reviewComments[task.id] ?? "").trim().length < 3} onClick={() => reviewTask(task, "request_changes")}>درخواست اصلاح</button>
                                    <button type="button" className="primary-button" disabled={updatingTask === task.id} onClick={() => reviewTask(task, "approve")}>تأیید نهایی</button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}

                        {task.status === "changes_requested" && (
                          <div className="project-task-review-meta is-returned">
                            <strong>درخواست اصلاح از طرف {reviewerName}</strong>
                            {task.reviewComment && <p>{task.reviewComment}</p>}
                            {task.reviewedAt && <time dateTime={task.reviewedAt}>{formatDate(task.reviewedAt)}</time>}
                          </div>
                        )}

                        {task.status === "done" && task.reviewedAt && (
                          <div className="project-task-review-meta is-approved">
                            <strong>تأیید نهایی توسط {reviewerName}</strong>
                            {task.reviewComment && <p>{task.reviewComment}</p>}
                            <time dateTime={task.reviewedAt}>{formatDate(task.reviewedAt)}</time>
                          </div>
                        )}

                        {canSubmit && (
                          <button
                            className="project-task-submit-review"
                            type="button"
                            disabled={updatingTask === task.id}
                            onClick={() => reviewTask(task, "submit_for_review")}
                          >
                            {updatingTask === task.id ? "در حال ارسال..." : "ارسال برای تأیید نهایی"}
                          </button>
                        )}
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
          ? "مدیران پروژه درخواست بررسی را تأیید یا برای اصلاح بازمی‌گردانند. ارسال‌کننده نمی‌تواند کار خودش را تأیید کند."
          : "مسئول یا ایجادکننده وظیفه می‌تواند آن را برای بررسی بفرستد؛ تأیید نهایی فقط با مدیر پروژه است. مشاهده‌گران فقط می‌خوانند."}
        {" "}ثبت تأیید، گردش کار داخلی پروژه است و به‌تنهایی گواه اعتبار علمی یا داوری مستقل نیست.
      </div>
    </section>
  );
}
