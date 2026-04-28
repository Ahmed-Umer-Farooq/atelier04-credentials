import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import Redis from "ioredis";

export async function runStartupChecks() {
  console.log("\n🔍 Checking connections...");

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma  = new PrismaClient({ adapter } as never);
  try {
    await prisma.$connect();
    console.log("✅ Database connected:", process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ":***@"));
  } catch (e: unknown) {
    console.error("❌ Database failed:", (e as Error).message);
  } finally {
    await prisma.$disconnect();
  }

  const redis = new Redis(process.env.REDIS_URL!, { lazyConnect: true, connectTimeout: 3000 });
  try {
    await redis.connect();
    await redis.ping();
    console.log("✅ Redis connected:", process.env.REDIS_URL);
  } catch (e: unknown) {
    console.error("❌ Redis failed:", (e as Error).message);
  } finally {
    redis.disconnect();
  }

  console.log("");
}
