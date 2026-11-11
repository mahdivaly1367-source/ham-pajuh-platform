import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import * as schema from "@/src/db/schema";
import { getDb } from "@/src/db";

function buildAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;

  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
    throw new Error("BETTER_AUTH_SECRET must be set to a random value of at least 32 characters in production.");
  }

  return betterAuth({
    appName: "HamPajuh",
    baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000",
    secret: secret ?? "hampajuh-local-development-secret-only",
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128
    },
    rateLimit: {
      enabled: true
    },
    trustedOrigins: [
      process.env.APP_URL ?? "http://localhost:3000"
    ]
  });
}

type AuthInstance = ReturnType<typeof buildAuth>;
let authInstance: AuthInstance | undefined;

export function getAuth(): AuthInstance {
  if (!authInstance) {
    authInstance = buildAuth();
  }
  return authInstance;
}
