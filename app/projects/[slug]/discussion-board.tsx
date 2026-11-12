"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type DiscussionKind = "general" | "question" | "decision" | "review";
type TopicStatus = "open" | "resolved";
type Topic = {
  id: string; taskId: string | null; authorId: string; kind: DiscussionKind; title: string; body: string;
  status: TopicStatus; resolvedAt: string | null; createdAt: string; updatedAt: string;
  authorName: string; authorHandle: string | null; taskTitle: string | null;
  replyCount: number; latestReplyAt: string | null; isAuthor: boolean; canResolve: boolean;
};
type DiscussionPost = {
  id: string; body: string; authorId: string; authorName: string; authorHandle: string | null;
  createdAt: string; editedAt: string | null;
};
type DiscussionTask = { id: string; title: string };
type Payload = { topics: Topic[]; tasks: DiscussionTask[]; access: { role: string; currentUserId: string; canWrite: boolean } };

const kindLabels: Record<DiscussionKind, string> = {
  general: "گفت‌وگوی عمومی", question: "پرسش پژوهشی", decision: "تصمیم تیم", review: "بازبینی همتا"
};

export default function ProjectDiscussionBoard({ projectId, onDiscussionChanged }: {
  projectId: string; onDiscussionChanged: () => void;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedTopic, setExpandedTopic] = useState("");
  const [postsByTopic, setPostsByTopic] = useState<Record<string, DiscussionPost[]>>({});
  const [loadingPosts, setLoadingPosts] = useState("");
  const [savingReply, setSavingReply] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ title: "", body: "", kind: "general" as DiscussionKind, taskId: "" });

  const loadBoard = useCallback(async () => {
    try {
      const response = await fetch("/api/projects/" + encodeURIComponent(projectId) + "/discussions", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "دریافت گفت‌وگوهای پروژه انجام نشد.");
      setPayload(result as Payload);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "دریافت گفت‌وگوهای پروژه انجام نشد.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { setLoading(true); void loadBoard(); }, [loadBoard]);

  async function loadPosts(topicId: string) {
    setLoadingPosts(topicId);
    try {
      const response = await fetch("/api/projects/" + encodeURIComponent(projectId) + "/discussions/" + encodeURIComponent(topicId) + "/posts", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "دریافت پاسخ‌ها انجام نشد.");
      setPostsByTopic((current) => ({ ...current, [topicId]: result.posts as DiscussionPost[] }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "دریافت پاسخ‌ها انجام نشد.");
    } finally {
      setLoadingPosts("");
    }
  }

  async function toggleTopic(topicId: string) {
    if (expandedTopic === topicId) { setExpandedTopic(""); return; }
    setExpandedTopic(topicId);
    if (!postsByTopic[topicId]) await loadPosts(topicId);
  }

  async function createTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payload?.access.canWrite) return;
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/projects/" + encodeURIComponent(projectId) + "/discussions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title.trim(), body: form.body.trim(), kind: form.kind, taskId: form.taskId || null })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(result.error ?? "ایجاد بحث انجام نشد."); return; }
      setForm({ title: "", body: "", kind: "general", taskId: "" });
      setFormOpen(false);
      await loadBoard();
      setNotice("موضوع جدید به گفت‌وگوهای پروژه افزوده شد.");
      onDiscussionChanged();
    } catch { setNotice("ارتباط با سرور برقرار نشد."); }
    finally { setSaving(false); }
  }

  async function createReply(event: FormEvent<HTMLFormElement>, topicId: string) {
    event.preventDefault();
    if (!payload?.access.canWrite) return;
    const body = (replyDrafts[topicId] ?? "").trim();
    if (!body) return;
    setSavingReply(topicId); setNotice("");
    try {
      const response = await fetch("/api/projects/" + encodeURIComponent(projectId) + "/discussions/" + encodeURIComponent(topicId) + "/posts", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(result.error ?? "ثبت پاسخ انجام نشد."); return; }
      setReplyDrafts((current) => ({ ...current, [topicId]: "" }));
      await loadPosts(topicId); await loadBoard(); onDiscussionChanged();
    } catch { setNotice("ارتباط با سرور برقرار نشد."); }
    finally { setSavingReply(""); }
  }

  async function changeTopicStatus(topic: Topic) {
    const action = topic.status === "open" ? "resolve" : "reopen";
    setNotice("");
    try {
      const response = await fetch("/api/projects/" + encodeURIComponent(projectId) + "/discussions/" + encodeURIComponent(topic.id), {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(result.error ?? "تغییر وضعیت بحث انجام نشد."); return; }
      await loadBoard(); onDiscussionChanged();
    } catch { setNotice("ارتباط با سرور برقرار نشد."); }
  }

  const topics = payload?.topics ?? [];
  const tasks = payload?.tasks ?? [];
  const canWrite = payload?.access.canWrite ?? false;

  return (
    <section className="project-discussion-section">
      <div className="project-discussion-header">
        <div>
          <span className="section-kicker">گفت‌وگوی پژوهشی تیم</span>
          <h2>بحث، پرسش و بازبینی</h2>
          <p>نکته‌ها و بازخوردها را ثبت کنید و نتیجه بحث را شفاف نگه دارید.</p>
        </div>
        {canWrite && <button className="primary-button" type="button" onClick={() => setFormOpen((open) => !open)}>{formOpen ? "بستن فرم" : "ایجاد موضوع"}</button>}
      </div>
      {notice && <div className="project-discussion-notice" role="status">{notice}</div>}
      {formOpen && canWrite && (
        <form className="project-discussion-form" onSubmit={createTopic}>
          <label>عنوان موضوع
            <input value={form.title} minLength={5} maxLength={180} required onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="مثلاً: روش مناسب برای ارزیابی مدل چیست؟" />
          </label>
          <div className="project-discussion-form-row">
            <label>نوع موضوع
              <select value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as DiscussionKind }))}>
                <option value="general">گفت‌وگوی عمومی</option><option value="question">پرسش پژوهشی</option>
                <option value="decision">تصمیم تیم</option><option value="review">بازبینی همتا</option>
              </select>
            </label>
            <label>پیوند به وظیفه
              <select value={form.taskId} onChange={(event) => setForm((current) => ({ ...current, taskId: event.target.value }))}>
                <option value="">بدون پیوند</option>
                {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select>
            </label>
          </div>
          <label>شرح موضوع
            <textarea value={form.body} minLength={10} maxLength={12000} rows={4} required onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} placeholder="زمینه، شواهد، پرسش یا پیشنهادی که باید بررسی شود را بنویسید..." />
          </label>
          <div className="project-discussion-form-foot">
            <span>بحث‌ها فقط برای اعضای پروژه قابل مشاهده‌اند. بازبینی همتا به‌تنهایی به معنی تأیید علمی نیست.</span>
            <button className="primary-button" type="submit" disabled={saving}>{saving ? "در حال ثبت..." : "ثبت موضوع"}</button>
          </div>
        </form>
      )}
      {loading ? <div className="project-empty-note">در حال دریافت گفت‌وگوها...</div> : topics.length === 0 ? (
        <div className="project-discussion-empty"><strong>هنوز موضوعی ثبت نشده است.</strong><p>پرسش‌ها، تصمیم‌ها و بازخوردهای علمی را در همین‌جا متمرکز کنید.</p></div>
      ) : (
        <div className="project-discussion-list">
          {topics.map((topic) => (
            <article className={"project-discussion-topic" + (topic.status === "resolved" ? " is-resolved" : "")} key={topic.id}>
              <div className="project-discussion-topic-top">
                <div className="project-discussion-topic-badges">
                  <span className={"discussion-kind kind-" + topic.kind}>{kindLabels[topic.kind]}</span>
                  <span className={"discussion-state state-" + topic.status}>{topic.status === "resolved" ? "حل‌شده" : "باز"}</span>
                  {topic.taskTitle && <span className="discussion-task-link">وظیفه: {topic.taskTitle}</span>}
                </div>
                <time dateTime={topic.updatedAt}>{new Date(topic.updatedAt).toLocaleDateString("fa-IR")}</time>
              </div>
              <h3>{topic.title}</h3>
              <p className="project-discussion-topic-body">{topic.body}</p>
              <div className="project-discussion-topic-footer">
                <span>{topic.authorHandle || topic.authorName}</span>
                <span>{topic.replyCount.toLocaleString("fa-IR")} پاسخ</span>
                <button type="button" onClick={() => void toggleTopic(topic.id)}>{expandedTopic === topic.id ? "بستن پاسخ‌ها" : "مشاهده پاسخ‌ها"}</button>
                {topic.canResolve && <button className="discussion-resolve-button" type="button" onClick={() => void changeTopicStatus(topic)}>{topic.status === "resolved" ? "بازگشایی بحث" : "علامت‌گذاری به‌عنوان حل‌شده"}</button>}
              </div>
              {expandedTopic === topic.id && (
                <div className="project-discussion-replies">
                  {loadingPosts === topic.id ? <div className="project-empty-note">در حال دریافت پاسخ‌ها...</div> :
                    (postsByTopic[topic.id] ?? []).length ? (postsByTopic[topic.id] ?? []).map((post) => (
                      <div className="project-discussion-post" key={post.id}>
                        <div className="project-discussion-post-meta"><strong>{post.authorHandle || post.authorName}</strong>
                          <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" })}</time></div>
                        <p>{post.body}</p>
                      </div>
                    )) : <div className="project-empty-note">هنوز پاسخی ثبت نشده است.</div>}
                  {canWrite && topic.status === "open" && (
                    <form className="project-discussion-reply-form" onSubmit={(event) => void createReply(event, topic.id)}>
                      <textarea value={replyDrafts[topic.id] ?? ""} rows={2} maxLength={10000} required placeholder="پاسخ یا بازخورد خود را بنویسید..." onChange={(event) => setReplyDrafts((current) => ({ ...current, [topic.id]: event.target.value }))} />
                      <button className="secondary-button" type="submit" disabled={savingReply === topic.id || !(replyDrafts[topic.id] ?? "").trim()}>{savingReply === topic.id ? "در حال ارسال..." : "ارسال پاسخ"}</button>
                    </form>
                  )}
                  {!canWrite && <div className="project-discussion-readonly">نقش مشاهده‌گر فقط امکان خواندن گفت‌وگوها را دارد.</div>}
                  {topic.status === "resolved" && <div className="project-discussion-readonly">این بحث بسته شده است؛ برای ادامه، نویسنده یا مدیر پروژه باید آن را بازگشایی کند.</div>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
