import { z } from "zod";

export const createProjectInput = z.object({
  title: z.string().trim().min(5, "عنوان پروژه باید دست‌کم ۵ نویسه باشد.").max(100),
  summary: z.string().trim().min(20, "توضیح کوتاه باید دست‌کم ۲۰ نویسه باشد.").max(280),
  description: z.string().trim().max(12000).optional().default(""),
  disciplineSlug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  visibility: z.enum(["public", "private", "unlisted"]).default("private")
});

export const updateProfileInput = z.object({
  handle: z.string().trim().toLowerCase().min(3).max(40).regex(/^[a-z0-9][a-z0-9-]*$/),
  headline: z.string().trim().max(160).optional().default(""),
  bio: z.string().trim().max(2000).optional().default(""),
  location: z.string().trim().max(120).optional().default(""),
  website: z.union([z.string().trim().url(), z.literal("")]).optional().default(""),
  isPublic: z.boolean().default(true)
});

export type CreateProjectInput = z.infer<typeof createProjectInput>;
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;
