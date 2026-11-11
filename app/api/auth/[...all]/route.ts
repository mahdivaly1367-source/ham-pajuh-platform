import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const handlers = toNextJsHandler(getAuth());
  return handlers.GET(request);
}

export async function POST(request: Request) {
  const handlers = toNextJsHandler(getAuth());
  return handlers.POST(request);
}
