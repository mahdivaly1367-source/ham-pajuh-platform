"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

type Project = {
  id: string | number;
  slug?: string;
  title: string;
  summary: string;
  discipline: string;
  color: string;
  owner: string;
  initials: string;
  updated: string;
  members: number;
  stars: number;
  tags: string[];
  stage: string;
};

const seedProjects: Project[] = [
  { id: 1, title: "نقشه بازِ کیفیت هوای شهرها", summary: "سامانه‌ای مشارکتی برای گردآوری، پاک‌سازی و نمایش داده‌های کیفیت هوا با امکان اتصال حسگرهای ارزان‌قیمت.", discipline: "محیط زیست و زمین", color: "mint", owner: "گروه داده‌باز", initials: "دب", updated: "۲ ساعت پیش", members: 8, stars: 126, tags: ["داده‌باز", "پایش محیطی", "Python"], stage: "در حال توسعه" },
  { id: 2, title: "آزمایشگاه فارسیِ مدل‌های زبانی", summary: "ارزیابی شفاف مدل‌های زبانی فارسی؛ از کیفیت پاسخ و استدلال تا سوگیری و کارایی در کاربردهای واقعی.", discipline: "هوش مصنوعی", color: "violet", owner: "آزمایشگاه زبان", initials: "زف", updated: "امروز", members: 14, stars: 94, tags: ["NLP", "داده فارسی", "ارزیابی مدل"], stage: "پذیرای همکار" },
  { id: 3, title: "بازوی رباتیک کم‌هزینه و متن‌باز", summary: "طراحی مکانیکی، کنترل و ساخت نمونه‌ای ماژولار با قطعات قابل تولید در کارگاه و چاپ سه‌بعدی.", discipline: "مهندسی", color: "amber", owner: "کارگاه رباتیک", initials: "کر", updated: "دیروز", members: 6, stars: 71, tags: ["CAD", "کنترل", "چاپ سه‌بعدی"], stage: "نمونه‌سازی" },
  { id: 4, title: "بانک داده گیاهان بومی ایران", summary: "مستندسازی گونه‌های گیاهی با داده‌های مکانی، تصویر، ویژگی‌های زیستی و منابع قابل ارجاع.", discipline: "زیست‌شناسی و زیست‌فناوری", color: "mint", owner: "زیست‌داده", initials: "زد", updated: "۳ روز پیش", members: 11, stars: 58, tags: ["تنوع زیستی", "داده علمی", "GIS"], stage: "گردآوری داده" },
  { id: 5, title: "شبیه‌ساز تعاملی مدارهای الکتریکی", summary: "محیطی آموزشی و پژوهشی برای ساخت مدار، مشاهده رفتار زمانی و اشتراک‌گذاری آزمایش‌های الکترونیکی.", discipline: "فیزیک و علوم پایه", color: "blue", owner: "مدار باز", initials: "مب", updated: "۴ روز پیش", members: 5, stars: 43, tags: ["الکترونیک", "شبیه‌سازی", "آموزش"], stage: "در حال توسعه" },
  { id: 6, title: "آرشیو روایت‌های شفاهی محلی", summary: "ثبت و نگهداری روایت‌ها و گویش‌های محلی با رعایت رضایت و حقوق مشارکت‌کنندگان.", discipline: "علوم انسانی و اجتماعی", color: "rose", owner: "حافظه زنده", initials: "حز", updated: "یک هفته پیش", members: 9, stars: 37, tags: ["زبان‌شناسی", "آرشیو", "فرهنگ"], stage: "پذیرای همکار" }
];

const disciplines = ["همه حوزه‌ها", "هوش مصنوعی", "نرم‌افزار و علوم رایانه", "مهندسی", "مکانیک و ساخت", "الکترونیک و برق", "هوافضا", "رباتیک", "زیست‌شناسی و زیست‌فناوری", "فیزیک و علوم پایه", "محیط زیست و زمین", "ریاضیات و آمار", "علوم انسانی و اجتماعی", "آموزش و یادگیری", "میان‌رشته‌ای"];

const disciplineSlugs: Record<string, string> = {
  "هوش مصنوعی": "artificial-intelligence",
  "نرم‌افزار و علوم رایانه": "software",
  "مهندسی": "engineering",
  "مکانیک و ساخت": "mechanical",
  "الکترونیک و برق": "electronics",
  "هوافضا": "aerospace",
  "رباتیک": "robotics",
  "زیست‌شناسی و زیست‌فناوری": "life-sciences",
  "فیزیک و علوم پایه": "physical-sciences",
  "علوم پایه": "physical-sciences",
  "محیط زیست و زمین": "environment",
  "محیط زیست": "environment",
  "ریاضیات و آمار": "mathematics",
  "علوم انسانی و اجتماعی": "humanities",
  "علوم انسانی": "humanities",
  "آموزش و یادگیری": "education",
  "میان‌رشته‌ای": "interdisciplinary"
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const shapes: Record<string, ReactNode> = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    bookmark: <path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-4-6 4V4.75Z" />,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.1 2.4 2.4 1.1-2.4 1.1L19 21l-1.1-2.4-2.4-1.1 2.4-1.1L19 14Z" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></>,
    flask: <><path d="M9 3h6M10 3v6l-5.2 8.4A2.4 2.4 0 0 0 6.9 21h10.2a2.4 2.4 0 0 0 2.1-3.6L14 9V3" /><path d="M8 15h8" /></>,
    leaf: <><path d="M20 4c-8 0-14 3-14 10a6 6 0 0 0 6 6c7 0 8-8 8-16Z" /><path d="M4 21c2-5 6-8 12-11" /></>,
    heart: <path d="M20.8 8.8c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z" />,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    code: <><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    chevron: <path d="m9 18 6-6-6-6" />
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name] ?? <circle cx="12" cy="12" r="8" />}</svg>;
}

function BrandMark() {
  return <span className="brand-symbol"><i /><i /><i /></span>;
}

export default function HomePage() {
  const [projects, setProjects] = useState(seedProjects);
  const [activeDiscipline, setActiveDiscipline] = useState("همه حوزه‌ها");
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [requested, setRequested] = useState<Array<string | number>>([]);
  const [notice, setNotice] = useState("");
  const [liveData, setLiveData] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/projects", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data: unknown) => {
        if (active && Array.isArray(data)) {
          setProjects(data as Project[]);
          setLiveData(true);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const visibleProjects = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("fa");
    return projects.filter((project) => {
      const disciplineMatch = activeDiscipline === "همه حوزه‌ها" || project.discipline === activeDiscipline;
      const searchable = [project.title, project.summary, project.discipline, project.owner, ...project.tags].join(" ").toLocaleLowerCase("fa");
      return disciplineMatch && (!term || searchable.includes(term));
    });
  }, [projects, activeDiscipline, query]);

  function notify(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 5000);
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") || "").trim();
    const summary = String(form.get("summary") || "").trim();
    const discipline = String(form.get("discipline") || "میان‌رشته‌ای");
    const visibility = String(form.get("visibility") || "private");
    if (!title || !summary) return;

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          summary,
          disciplineSlug: disciplineSlugs[discipline] ?? "interdisciplinary",
          visibility
        })
      });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 401) {
        notify("برای ساخت پروژه باید وارد حساب کاربری شوی. در حال انتقال به صفحه ورود...");
        window.setTimeout(() => { window.location.href = "/auth"; }, 900);
        return;
      }
      if (!response.ok) {
        notify(payload.error ?? "ساخت پروژه انجام نشد. تنظیمات پایگاه داده را بررسی کن.");
        return;
      }

      const created = payload.project as Project;
      if (typeof created.slug !== "string" || !created.slug) {
        notify("پروژه ساخته شد، اما شناسه نشانی آن از سرور دریافت نشد.");
        return;
      }
      if (visibility === "public") {
        setProjects((current) => [created, ...current]);
        setActiveDiscipline("همه حوزه‌ها");
        setQuery("");
        setShowCreate(false);
        formElement.reset();
        notify("پروژه ساخته و برای نمایش عمومی منتشر شد.");
      } else {
        setShowCreate(false);
        formElement.reset();
        window.location.assign("/projects/" + encodeURIComponent(created.slug));
      }
    } catch {
      notify("ارتباط با سرور برقرار نشد. اتصال شبکه و وضعیت برنامه را بررسی کن.");
    }
  }

  async function toggleRequest(id: string | number) {
    if (!liveData || typeof id !== "string") {
      notify("این مورد نمونه نمایشی است. درخواست همکاری واقعی پس از اتصال پایگاه داده فعال می‌شود.");
      return;
    }

    try {
      const response = await fetch("/api/projects/" + encodeURIComponent(id) + "/join", {
        method: "POST"
      });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 401) {
        notify("برای درخواست همکاری ابتدا وارد حساب کاربری شو.");
        window.setTimeout(() => { window.location.href = "/auth"; }, 900);
        return;
      }
      if (!response.ok && response.status !== 409) {
        notify(payload.error ?? "ثبت درخواست همکاری انجام نشد.");
        return;
      }

      setRequested((current) => current.includes(id) ? current : [...current, id]);
      notify(payload.message ?? "درخواست همکاری ثبت شد.");
    } catch {
      notify("ارتباط با سرور برقرار نشد.");
    }
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="هم‌پژوه، صفحه اصلی">
          <BrandMark /><span className="brand-copy"><strong>هم‌پژوه</strong><small>شبکه علم و ساختن</small></span>
        </a>
        <nav className={menuOpen ? "main-nav open" : "main-nav"} aria-label="ناوبری اصلی">
          <a className="nav-link active" href="#projects">کشف پروژه‌ها</a>
          <a className="nav-link" href="#disciplines">حوزه‌های علمی</a>
          <a className="nav-link" href="#collaboration">همکاری</a>
          <a className="nav-link" href="#about">درباره هم‌پژوه</a>
        </nav>
        <div className="topbar-actions">
          <button className="language-button" type="button"><Icon name="globe" size={16} /> FA</button>
          <Link className="login-button" href="/auth">ورود / ثبت‌نام</Link>
          <Link className="login-button" href="/dashboard">پروژه‌های من</Link>
          <Link className="login-button" href="/profile">پروفایل من</Link>
          <button className="header-cta" type="button" onClick={() => setShowCreate(true)}><Icon name="plus" size={17} /> پروژه جدید</button>
          <button className="mobile-menu-button" type="button" onClick={() => setMenuOpen((value) => !value)} aria-label="باز کردن منو"><Icon name={menuOpen ? "close" : "menu"} size={21} /></button>
        </div>
      </header>

      <section className="hero" id="about">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> دانش، وقتی به اشتراک گذاشته می‌شود رشد می‌کند</div>
          <h1>ایده‌ها را به<br /><em>دستاوردهای مشترک</em> تبدیل کنیم.</h1>
          <p className="hero-description">هم‌پژوه جایی برای ساختن است؛ از یک فرضیه علمی تا یک محصول فناورانه. پروژه پیدا کن، هم‌تیمی شو و اثری بساز که بتوان به آن استناد کرد.</p>
          <div className="hero-actions">
            <a className="primary-button" href="#projects">کاوش پروژه‌ها <Icon name="arrow" size={17} /></a>
            <button className="secondary-button" type="button" onClick={() => setShowCreate(true)}><Icon name="plus" size={17} /> شروع یک پروژه</button>
          </div>
          <div className="hero-proof"><div className="proof-avatars"><span>م</span><span>آ</span><span>ن</span><span>+</span></div><span>برای پژوهشگران مستقل، دانشجویان و سازندگان</span></div>
        </div>

        <div className="hero-visual" aria-label="نمای گرافیکی شبکه همکاری علمی">
          <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
          <div className="visual-node node-a"><Icon name="flask" size={19} /></div>
          <div className="visual-node node-b"><Icon name="code" size={19} /></div>
          <div className="visual-node node-c"><Icon name="leaf" size={19} /></div>
          <div className="visual-center"><span className="center-mark"><i /><i /><i /></span><strong>دانشِ پیوندخورده</strong><small>از رشته‌ها تا راه‌حل‌ها</small></div>
          <div className="floating-card spotlight-card">
            <div className="spotlight-top"><span className="spotlight-label">پروژه منتخب</span><span className="live-indicator">فعال</span></div>
            <strong>آزمایشگاه بازِ ایده‌ها</strong><p>پژوهشگران و سازندگان در کنار هم</p>
            <div className="spotlight-bottom"><span><Icon name="users" size={14} /> ۱۲ مشارکت‌کننده</span><span>مشاهده پروژه ←</span></div>
          </div>
          <div className="floating-note"><Icon name="spark" size={15} /> هر مشارکت، یک ردپای ماندگار</div>
        </div>
      </section>

      <section className="metrics" aria-label="ویژگی‌های پلتفرم">
        <div className="metric-item"><span className="metric-icon violet-bg"><Icon name="layers" /></span><div><strong>همه رشته‌ها</strong><small>یک فضای مشترک</small></div></div>
        <div className="metric-item"><span className="metric-icon green-bg"><Icon name="users" /></span><div><strong>همکاری بدون مرز</strong><small>تخصص‌های مکمل</small></div></div>
        <div className="metric-item"><span className="metric-icon orange-bg"><Icon name="spark" /></span><div><strong>اعتبار مشارکت</strong><small>سهم هر فرد دیده می‌شود</small></div></div>
        <div className="metric-item"><span className="metric-icon blue-bg"><Icon name="globe" /></span><div><strong>فارسی و انگلیسی</strong><small>آماده ارتباط جهانی</small></div></div>
      </section>

      <section className="explore-section" id="projects">
        <div className="section-heading"><div><div className="section-kicker">از جامعه هم‌پژوه</div><h2>پروژه‌هایی که ارزش دنبال‌کردن دارند</h2><p>ایده‌ها و فعالیت‌های علمی و فناورانه را کشف کن؛ یا جای خودت را در یک تیم پیدا کن.</p></div>
          <button className="text-link" type="button" onClick={() => { setActiveDiscipline("همه حوزه‌ها"); setQuery(""); }}>نمایش همه پروژه‌ها <Icon name="arrow" size={16} /></button>
        </div>

        <div className="catalog-layout">
          <aside className="filter-panel" id="disciplines">
            <div className="filter-title"><span><Icon name="layers" size={17} /> حوزه‌های علمی</span><span className="filter-count">۱۵</span></div>
            <div className="discipline-list">
              {disciplines.map((discipline, index) => <button className={activeDiscipline === discipline ? "discipline-option selected" : "discipline-option"} key={discipline} type="button" onClick={() => setActiveDiscipline(discipline)}><span className={"discipline-dot dot-" + index} /><span>{discipline}</span>{activeDiscipline === discipline && <Icon name="chevron" size={15} />}</button>)}
            </div>
            <div className="filter-divider" />
            <div className="filter-title"><span><Icon name="spark" size={17} /> شروع سریع</span></div>
            <div className="starter-card"><span className="starter-icon"><Icon name="plus" size={18} /></span><strong>ایده‌ای در ذهن داری؟</strong><p>پروژه‌ات را تعریف کن و اولین همکارانت را پیدا کن.</p><button type="button" onClick={() => setShowCreate(true)}>ساخت پروژه <Icon name="arrow" size={14} /></button></div>
            <div className="open-note"><span className="open-note-dot" /> مشارکت در پروژه‌های عمومی آزاد است</div>
          </aside>

          <div className="projects-area">
            <div className="projects-toolbar"><div className="result-count"><strong>{visibleProjects.length.toLocaleString("fa-IR")}</strong> پروژه در این نما</div>
              <label className="project-search"><Icon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی پروژه، مهارت یا موضوع..." aria-label="جست‌وجوی پروژه‌ها" /><kbd>⌘ K</kbd></label>
            </div>
            <div className="project-grid">
              {visibleProjects.map((project) => <article className="project-card" key={project.id}>
                <div className="project-card-top"><span className={"project-discipline " + project.color}>{project.discipline}</span><button className="bookmark-button" type="button" aria-label="ذخیره پروژه" onClick={() => notify("قابلیت ذخیره پروژه پس از راه‌اندازی حساب کاربری فعال می‌شود.")}><Icon name="bookmark" size={17} /></button></div>
                <h3>{project.slug ? <Link href={"/projects/" + encodeURIComponent(project.slug)}>{project.title}</Link> : project.title}</h3><p className="project-summary">{project.summary}</p>
                <div className="tag-list">{project.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                <div className="project-divider" />
                <div className="project-owner"><span className="owner-avatar">{project.initials}</span><span className="owner-name">{project.owner}<small>{project.updated}</small></span><span className="project-stage">{project.stage}</span></div>
                <div className="project-footer"><div className="project-stats"><span><Icon name="users" size={15} /> {project.members.toLocaleString("fa-IR")}</span><span><Icon name="heart" size={14} /> {project.stars.toLocaleString("fa-IR")}</span></div>
                  <button className={requested.includes(project.id) ? "collaborate-button requested" : "collaborate-button"} type="button" onClick={() => toggleRequest(project.id)}>{requested.includes(project.id) ? "درخواست ثبت شد" : "درخواست همکاری"}</button>
                </div>
              </article>)}
            </div>
            {visibleProjects.length === 0 && <div className="empty-state"><span><Icon name="search" size={24} /></span><strong>پروژه‌ای پیدا نشد</strong><p>عبارت جست‌وجو یا حوزه انتخاب‌شده را تغییر بده.</p><button type="button" onClick={() => { setQuery(""); setActiveDiscipline("همه حوزه‌ها"); }}>پاک‌کردن فیلترها</button></div>}
            <div className="catalog-footnote">{liveData ? "نمایش پروژه‌های عمومی دریافت‌شده از پایگاه داده هم‌پژوه." : "در حال نمایش داده‌های نمونه؛ برای فعال‌شدن فهرست زنده باید پایگاه داده پیکربندی شود."}</div>
          </div>
        </div>
      </section>

      <section className="collaboration-banner" id="collaboration">
        <div className="banner-ornament"><span /><span /><span /></div>
        <div className="banner-copy"><span className="banner-kicker">فراتر از یک مخزن کد</span><h2>پروژه علمی فقط کد نیست.<br />هر نوع دانشی، جایی برای رشد دارد.</h2><p>از داده و مقاله تا مدل سه‌بعدی، آزمایش، شبیه‌سازی و نمونه‌سازی؛ هم‌پژوه برای همکاری میان‌رشته‌ای ساخته می‌شود.</p></div>
        <div className="banner-actions"><button type="button" onClick={() => setShowCreate(true)}>ایده‌ام را به پروژه تبدیل می‌کنم <Icon name="arrow" size={17} /></button><span>شروع رایگان · مشارکت باز · اعتبار برای مشارکت‌کنندگان</span></div>
      </section>

      <footer className="footer"><a className="brand footer-brand" href="#"><BrandMark /><span className="brand-copy"><strong>هم‌پژوه</strong><small>علم با همکاری پیش می‌رود</small></span></a><span>نسخه نمایشی اولیه · ۲۰۲۶</span><span>ساخته‌شده برای جامعه علم و فناوری</span></footer>

      {notice && <div className="toast" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="بستن پیام"><Icon name="close" size={15} /></button></div>}

      {showCreate && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}>
        <section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
          <div className="modal-heading"><div><span className="section-kicker">یک مسیر تازه آغاز کن</span><h2 id="create-title">تعریف پروژه جدید</h2></div><button className="modal-close" type="button" onClick={() => setShowCreate(false)} aria-label="بستن"><Icon name="close" /></button></div>
          <p className="modal-description">در چند خط بگو روی چه مسئله‌ای کار می‌کنی. می‌توانی بعداً جزئیات، فایل‌ها و همکاران را اضافه کنی.</p>
          <form onSubmit={createProject}>
            <label>عنوان پروژه<input name="title" required maxLength={90} placeholder="مثلاً طراحی یک حسگر کم‌هزینه..." /></label>
            <label>حوزه اصلی<select name="discipline">{disciplines.filter((item) => item !== "همه حوزه‌ها").map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>توضیح کوتاه<textarea name="summary" required minLength={20} maxLength={280} rows={4} placeholder="مسئله چیست و می‌خواهی به چه نتیجه‌ای برسی؟" /></label>
            <label>سطح دسترسی<select name="visibility" defaultValue="private"><option value="private">خصوصی — فقط اعضای دعوت‌شده</option><option value="public">عمومی — قابل مشاهده برای همه</option></select></label>
            <div className="modal-note"><Icon name="info" size={16} /> پروژه‌ها به‌صورت پیش‌فرض خصوصی ساخته می‌شوند. برای نمایش در جست‌وجوی عمومی، گزینه عمومی را انتخاب کن.</div>
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setShowCreate(false)}>انصراف</button><button className="primary-button" type="submit">ثبت پروژه <Icon name="arrow" size={16} /></button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}
