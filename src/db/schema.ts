import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull()
  };
}

// Better Auth standard PostgreSQL models.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  ...timestamps()
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  ...timestamps()
}, (table) => [
  index("session_user_id_idx").on(table.userId)
]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true, mode: "date" }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true, mode: "date" }),
  scope: text("scope"),
  password: text("password"),
  ...timestamps()
}, (table) => [
  index("account_user_id_idx").on(table.userId),
  uniqueIndex("account_provider_account_unique").on(table.providerId, table.accountId)
]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  ...timestamps()
}, (table) => [
  index("verification_identifier_idx").on(table.identifier)
]);

export const projectVisibility = pgEnum("project_visibility", ["public", "private", "unlisted"]);
export const projectStatus = pgEnum("project_status", ["idea", "active", "paused", "completed", "archived"]);
export const projectMemberRole = pgEnum("project_member_role", ["owner", "maintainer", "contributor", "viewer"]);
export const collaborationRequestStatus = pgEnum("collaboration_request_status", ["pending", "accepted", "declined", "withdrawn"]);
export const artifactType = pgEnum("artifact_type", ["source_code", "document", "dataset", "model", "cad", "schematic", "image", "video", "simulation", "other"]);
export const projectTaskStatus = pgEnum("project_task_status", ["todo", "in_progress", "blocked", "done", "in_review", "changes_requested"]);
export const projectTaskPriority = pgEnum("project_task_priority", ["low", "normal", "high", "urgent"]);
export const projectDiscussionKind = pgEnum("project_discussion_kind", ["general", "question", "decision", "review"]);
export const projectDiscussionStatus = pgEnum("project_discussion_status", ["open", "resolved"]);

export const profiles = pgTable("profile", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  handle: varchar("handle", { length: 40 }).notNull().unique(),
  headline: varchar("headline", { length: 160 }),
  bio: text("bio"),
  location: varchar("location", { length: 120 }),
  website: text("website"),
  orcid: varchar("orcid", { length: 19 }),
  isPublic: boolean("is_public").default(true).notNull(),
  ...timestamps()
}, (table) => [
  uniqueIndex("profile_orcid_unique").on(table.orcid)
]);

export const profileSkills = pgTable("profile_skill", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => profiles.userId, { onDelete: "cascade" }),
  label: varchar("label", { length: 80 }).notNull(),
  normalizedLabel: varchar("normalized_label", { length: 80 }).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull()
}, (table) => [
  uniqueIndex("profile_skill_user_normalized_unique").on(table.userId, table.normalizedLabel),
  index("profile_skill_normalized_label_idx").on(table.normalizedLabel),
  index("profile_skill_user_order_idx").on(table.userId, table.sortOrder)
]);

export const disciplines = pgTable("discipline", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  nameFa: varchar("name_fa", { length: 120 }).notNull(),
  nameEn: varchar("name_en", { length: 120 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 24 }).default("mint").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  ...timestamps()
}, (table) => [
  index("discipline_active_order_idx").on(table.isActive, table.sortOrder)
]);

export const projects = pgTable("project", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  title: varchar("title", { length: 100 }).notNull(),
  summary: varchar("summary", { length: 280 }).notNull(),
  description: text("description").default("").notNull(),
  visibility: projectVisibility("visibility").default("private").notNull(),
  status: projectStatus("status").default("idea").notNull(),
  disciplineId: uuid("discipline_id").references(() => disciplines.id, { onDelete: "set null" }),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  ...timestamps()
}, (table) => [
  index("project_visibility_status_updated_idx").on(table.visibility, table.status, table.updatedAt),
  index("project_owner_id_idx").on(table.ownerId),
  index("project_discipline_id_idx").on(table.disciplineId)
]);

export const projectMembers = pgTable("project_member", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: projectMemberRole("role").default("contributor").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" }).defaultNow().notNull()
}, (table) => [
  uniqueIndex("project_member_project_user_unique").on(table.projectId, table.userId),
  index("project_member_user_id_idx").on(table.userId)
]);

export const projectTasks = pgTable("project_task", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description").default("").notNull(),
  status: projectTaskStatus("status").default("todo").notNull(),
  priority: projectTaskPriority("priority").default("normal").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  reviewRequestedAt: timestamp("review_requested_at", { withTimezone: true, mode: "date" }),
  reviewSubmittedBy: text("review_submitted_by").references(() => user.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
  reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
  reviewComment: text("review_comment").default("").notNull(),
  ...timestamps()
}, (table) => [
  index("project_task_project_status_created_idx").on(table.projectId, table.status, table.createdAt),
  index("project_task_assignee_status_idx").on(table.assigneeId, table.status)
]);


export const projectDiscussionTopics = pgTable("project_discussion_topic", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => projectTasks.id, { onDelete: "set null" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  kind: projectDiscussionKind("kind").default("general").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  status: projectDiscussionStatus("status").default("open").notNull(),
  resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  ...timestamps()
}, (table) => [
  index("project_discussion_topic_project_updated_idx").on(table.projectId, table.updatedAt),
  index("project_discussion_topic_task_idx").on(table.taskId),
  index("project_discussion_topic_author_idx").on(table.authorId)
]);

export const projectDiscussionPosts = pgTable("project_discussion_post", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicId: uuid("topic_id").notNull().references(() => projectDiscussionTopics.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  editedAt: timestamp("edited_at", { withTimezone: true, mode: "date" }),
  ...timestamps()
}, (table) => [
  index("project_discussion_post_topic_created_idx").on(table.topicId, table.createdAt),
  index("project_discussion_post_author_idx").on(table.authorId)
]);

export const collaborationRequests = pgTable("collaboration_request", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  message: text("message").default("").notNull(),
  status: collaborationRequestStatus("status").default("pending").notNull(),
  reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
  ...timestamps()
}, (table) => [
  index("collaboration_request_project_status_idx").on(table.projectId, table.status),
  index("collaboration_request_user_id_idx").on(table.userId),
  uniqueIndex("collaboration_request_pending_unique")
    .on(table.projectId, table.userId)
    .where(sql`status = 'pending'`)
]);

export const tags = pgTable("tag", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  labelFa: varchar("label_fa", { length: 80 }).notNull(),
  labelEn: varchar("label_en", { length: 80 }),
  ...timestamps()
});

export const projectTags = pgTable("project_tag", {
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" })
}, (table) => [
  uniqueIndex("project_tag_project_tag_unique").on(table.projectId, table.tagId),
  index("project_tag_tag_id_idx").on(table.tagId)
]);

export const projectArtifacts = pgTable("project_artifact", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  uploadedBy: text("uploaded_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  type: artifactType("type").default("other").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description").default("").notNull(),
  storageKey: text("storage_key").notNull(),
  originalFilename: varchar("original_filename", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 160 }),
  byteSize: text("byte_size").notNull(),
  checksumSha256: varchar("checksum_sha256", { length: 64 }),
  licenseId: varchar("license_id", { length: 80 }),
  versionLabel: varchar("version_label", { length: 80 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  ...timestamps()
}, (table) => [
  index("project_artifact_project_created_idx").on(table.projectId, table.createdAt),
  index("project_artifact_type_idx").on(table.type)
]);


export const notifications = pgTable("notification", {
  id: uuid("id").defaultRandom().primaryKey(),
  recipientId: text("recipient_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 80 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").default("").notNull(),
  href: varchar("href", { length: 500 }).default("/dashboard").notNull(),
  readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull()
}, (table) => [
  index("notification_recipient_created_idx").on(table.recipientId, table.createdAt),
  index("notification_recipient_unread_idx").on(table.recipientId, table.createdAt).where(sql`read_at IS NULL`)
]);

export const activityEvents = pgTable("activity_event", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).defaultNow().notNull()
}, (table) => [
  index("activity_event_project_time_idx").on(table.projectId, table.occurredAt),
  index("activity_event_actor_time_idx").on(table.actorId, table.occurredAt)
]);
