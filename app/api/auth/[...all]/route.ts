import { getAuth } from "@/lib/auth";

export const runtime = "nodejs";

async function handleAuth(request: Request) {
  return getAuth().handler(request);
}

export const GET = handleAuth;
export const POST = handleAuth;
