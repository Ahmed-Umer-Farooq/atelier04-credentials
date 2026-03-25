import { NextResponse } from "next/server";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import Redis from "ioredis";

export async function GET() {
  const results: Record<string, string> = {};

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    await prisma.$connect();
    results.database = "✅ Connected";
  } catch (e: unknown) {
    results.database = `❌ Failed: ${e instanceof Error ? e.message : e}`;
  } finally {
    await prisma.$disconnect();
  }

  // Test Redis
  const redis = new Redis(process.env.REDIS_URL!, { lazyConnect: true, connectTimeout: 3000 });
  try {
    await redis.connect();
    await redis.ping();
    results.redis = "✅ Connected";
  } catch (e: unknown) {
    results.redis = `❌ Failed: ${e instanceof Error ? e.message : e}`;
  } finally {
    redis.disconnect();
  }

  return NextResponse.json(results);
}
