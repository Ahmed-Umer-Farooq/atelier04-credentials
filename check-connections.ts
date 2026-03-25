import { PrismaClient } from "./app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import Redis from "ioredis";
import { config } from "dotenv";

config();

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const redis = new Redis(process.env.REDIS_URL!, { lazyConnect: true, connectTimeout: 3000 });

  console.log("\n🔍 Testing connections...\n");

  try {
    await prisma.$connect();
    console.log("✅ Database connected:", process.env.DATABASE_URL);
  } catch (e: unknown) {
    console.error("❌ Database failed:", (e as Error).message);
  } finally {
    await prisma.$disconnect();
  }

  try {
    await redis.connect();
    const pong = await redis.ping();
    console.log("✅ Redis connected:", process.env.REDIS_URL, "→", pong);
  } catch (e: unknown) {
    console.error("❌ Redis failed:", (e as Error).message);
  } finally {
    redis.disconnect();
  }
}

main();
