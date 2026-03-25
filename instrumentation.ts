import { PrismaClient } from "./app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import Redis from "ioredis";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  console.log("\n🔍 Checking connections...");

  // Database
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    await prisma.$connect();
    console.log("✅ Database connected: postgresql://localhost:5432/atelier04");
  } catch (e: unknown) {
    console.error("❌ Database failed:", (e as Error).message);
  } finally {
    await prisma.$disconnect();
  }

  // Redis
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
