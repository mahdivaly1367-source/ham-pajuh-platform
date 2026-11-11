import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "هم‌پژوه | شبکه همکاری علمی و فناورانه",
  description: "فضایی برای کشف پروژه‌های علمی، همکاری میان‌رشته‌ای و به‌اشتراک‌گذاری دستاوردهای فناوری.",
  applicationName: "HamPajuh",
  keywords: ["هم‌پژوه", "پژوهش", "همکاری علمی", "فناوری", "پروژه‌های متن‌باز"]
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f7f4"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="fa" dir="rtl"><body>{children}</body></html>;
}
