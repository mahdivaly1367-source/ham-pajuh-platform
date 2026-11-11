import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const globalForDatabase = globalThis as typeof globalThis & {
  hampajuhSql?: ReturnType<typeof postgres>;
  hampajuhDb?: ReturnType<typeof drizzle>;
};

function getSqlClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured. Copy .env.example to .env and add a PostgreSQL connection string.");
  }

  if (!globalForDatabase.hampajuhSql) {
    globalForDatabase.hampajuhSql = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false
    });
  }

  return globalForDatabase.hampajuhSql;
}

export function getDb() {
  if (!globalForDatabase.hampajuhDb) {
    globalForDatabase.hampajuhDb = drizzle({
      client: getSqlClient(),
      schema
    });
  }

  return globalForDatabase.hampajuhDb;
}

export async function closeDatabase() {
  if (globalForDatabase.hampajuhSql) {
    await globalForDatabase.hampajuhSql.end({ timeout: 5 });
    delete globalForDatabase.hampajuhSql;
    delete globalForDatabase.hampajuhDb;
  }
}
