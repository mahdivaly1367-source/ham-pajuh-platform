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

// Better Auth's standard PostgreSQL tables. Keep the property names aligned
// with Better Auth's default model fields; SQL columns use snake_case.
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull()
};

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  ...timestamps
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  ...timestamps
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
  ...timestamps
}, (table) => [
  index("account_user_id_idx").on(table.userId),
  uniqueIndex("account_provider_account_unique").on(table.providerId, table.accountId)
]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  ...timestamps
}, (table) => [
  index("verification_identifier_idx").on(table.identifier)
]);

export const projectVisibility = pgEnum("project_visibility", ["public", "private", "unlisted"]);
export const projectStatus = pgEnum("project_status", ["idea", "active", "paused", "completed", "archived"]);
export const projectMemberRole = pgEnum("project_member_role", ["owner", "maintainer", "contributor", "viewer"]);
export const collaborationRequestStatus = pgEnum("collaboration_request_status", ["pending", "accepted", "declined", "withdrawn"]);
export const artifactType = pgEnum("artifact_type", ["source_code", "document", "dataset", "model", "cad", "schematic", "image", "video", "simulation", "other"]);

export const profiles = pgTable("profile", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  handle: varchar("handle", { length: 40 }).notNull().unique(),
  headline: varchar("headline", { length: 160 }),
  bio: text("bio"),
  location: varchar("location", { length: 120 }),
  website: text("website"),
  orcid: varchar("orcid", { length: 19 }),
  isPublic: boolean("is_public").default(true).notNull(),
  ...timestamps
}, (table) => [
  uniqueIndex("profile_orcid_unique").on(table.orcid)
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
  ...timestamps
}, (table) => [
  index("discipline_active_order_idx").on(table.isActive, table.sortOrder)
]);

function integerOrder() {
  // Kept as a small helper to make the intended ordering field explicit.
  return importIntegerColumn();
}

function importIntegerColumn() {
  // Drizzle's integer builder is imported lazily in the declaration below.
  return integerColumn();
}
