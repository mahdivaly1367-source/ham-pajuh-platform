import { closeDatabase, getDb } from "./index";
import { disciplines } from "./schema";

const initialDisciplines = [
  { slug: "artificial-intelligence", nameFa: "هوش مصنوعی", nameEn: "Artificial Intelligence", color: "violet", sortOrder: 10 },
  { slug: "software", nameFa: "نرم‌افزار و علوم رایانه", nameEn: "Software & Computer Science", color: "blue", sortOrder: 20 },
  { slug: "engineering", nameFa: "مهندسی", nameEn: "Engineering", color: "amber", sortOrder: 30 },
  { slug: "mechanical", nameFa: "مکانیک و ساخت", nameEn: "Mechanical & Manufacturing", color: "amber", sortOrder: 40 },
  { slug: "electronics", nameFa: "الکترونیک و برق", nameEn: "Electronics & Electrical", color: "blue", sortOrder: 50 },
  { slug: "aerospace", nameFa: "هوافضا", nameEn: "Aerospace", color: "violet", sortOrder: 60 },
  { slug: "robotics", nameFa: "رباتیک", nameEn: "Robotics", color: "mint", sortOrder: 70 },
  { slug: "physical-sciences", nameFa: "فیزیک و علوم پایه", nameEn: "Physical Sciences", color: "blue", sortOrder: 80 },
  { slug: "life-sciences", nameFa: "زیست‌شناسی و زیست‌فناوری", nameEn: "Life Sciences & Biotechnology", color: "mint", sortOrder: 90 },
  { slug: "environment", nameFa: "محیط زیست و زمین", nameEn: "Environment & Earth", color: "mint", sortOrder: 100 },
  { slug: "mathematics", nameFa: "ریاضیات و آمار", nameEn: "Mathematics & Statistics", color: "violet", sortOrder: 110 },
  { slug: "humanities", nameFa: "علوم انسانی و اجتماعی", nameEn: "Humanities & Social Sciences", color: "rose", sortOrder: 120 },
  { slug: "education", nameFa: "آموزش و یادگیری", nameEn: "Education & Learning", color: "blue", sortOrder: 130 },
  { slug: "interdisciplinary", nameFa: "میان‌رشته‌ای", nameEn: "Interdisciplinary", color: "mint", sortOrder: 140 }
];

async function main() {
  try {
    await getDb().insert(disciplines).values(initialDisciplines).onConflictDoNothing({
      target: disciplines.slug
    });
    console.log(`Seeded/verified ${initialDisciplines.length} scientific disciplines.`);
  } finally {
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error("Database seed failed:", error);
  process.exitCode = 1;
});
