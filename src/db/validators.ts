import { z } from "zod";

export const createProjectInput = z.object({
  title: z.string().trim().min(5, "عنوان پروژه باید دست‌کم ۵ نویسه باشد.").max(100),
  summary: z.string().trim().min(20, "توضیح کوتاه باید دست‌کم ۲۰ نویسه باشد.").max(280),
  description: z.string().trim().max(12000).optional().default(""),
  disciplineSlug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  visibility: z.enum(["public", "private", "unlisted"]).default("private")
});

export type CreateProjectInput = z.infer<typeof createProjectInput>;
