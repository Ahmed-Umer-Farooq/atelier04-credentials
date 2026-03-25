import { NextRequest } from "next/server";

export function validateApiKey(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token === process.env.API_KEY;
}
