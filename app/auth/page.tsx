"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

type AuthMode = "signin" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signup");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");

    try {
      const result = mode === "signup"
        ? await authClient.signUp.email({
            name: name.trim(),
            email: email.trim(),
            password,
            callbackURL: "/"
          })
        : await authClient.signIn.email({
            email: email.trim(),
            password,
            callbackURL: "/"
          });

      if (result.error) {
        setMessage(result.error.message || "ورود یا ثبت‌نام انجام نشد. اطلاعات را بررسی کن.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setMessage("ارتباط با سامانه برقرار نشد. مطمئن شو مدیر سامانه پایگاه داده را پیکربندی کرده است.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-topline">
        <Link className="brand" href="/">
          <span className="brand-symbol"><i /><i /><i /></span>
          <span className="brand-copy"><strong>هم‌پژوه</strong><small>شبکه علم و ساختن</small></span>
        </Link>
        <Link className="auth-back" href="/">بازگشت به صفحه اصلی</Link>
      </div>

      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-emblem"><span /><span /><span /></div>
        <div className="section-kicker">عضویت در جامعه هم‌پژوه</div>
        <h1 id="auth-title">{mode === "signup" ? "حساب علمی خودت را بساز" : "به هم‌پژوه خوش برگشتی"}</h1>
        <p className="auth-intro">
          {mode === "signup"
            ? "برای ثبت پروژه‌ها، همکاری با دیگران و ساخت سابقه مشارکت، یک حساب ایجاد کن."
            : "وارد حساب خود شو و مسیر پروژه‌هایت را ادامه بده."}
        </p>

        <div className="auth-tabs" role="tablist" aria-label="نوع ورود">
          <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "selected" : ""} onClick={() => { setMode("signup"); setMessage(""); }}>ثبت‌نام</button>
          <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "selected" : ""} onClick={() => { setMode("signin"); setMessage(""); }}>ورود</button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && (
            <label>
              نام نمایشی
              <input value={name} onChange={(event) => setName(event.target.value)} name="name" autoComplete="name" required minLength={2} maxLength={80} placeholder="نامی که در پروژه‌ها نمایش داده می‌شود" />
            </label>
          )}
          <label>
            ایمیل
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" name="email" autoComplete="email" dir="ltr" required maxLength={254} placeholder="name@example.com" />
          </label>
          <label>
            گذرواژه
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" name="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} dir="ltr" required minLength={10} maxLength={128} placeholder="حداقل ۱۰ نویسه" />
          </label>

          {message && <div className="auth-message" role="alert">{message}</div>}

          <button className="auth-submit" type="submit" disabled={pending}>
            {pending ? "در حال بررسی..." : mode === "signup" ? "ساخت حساب و ادامه" : "ورود به حساب"}
          </button>
        </form>

        <div className="auth-security">
          <strong>حریم خصوصی و امنیت</strong>
          <p>گذرواژه به‌صورت متن ساده ذخیره نمی‌شود. اطلاعات حساب و نشست‌ها در پایگاه داده امن برنامه نگهداری خواهند شد.</p>
        </div>
      </section>

      <footer className="auth-footer">هم‌پژوه · علم با همکاری پیش می‌رود</footer>
    </main>
  );
}
