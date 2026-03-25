import { PrismaClient } from "./app/generated/prisma/client.js";
import Redis from "ioredis";
import { config } from "dotenv";

config();

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });

console.log("\n🔍 Testing connections...\n");

try {
  await prisma.$connect();
  console.log("✅ Database connected:", process.env.DATABASE_URL);
} catch (e) {
  console.error("❌ Database failed:", e.message);
} finally {
  await prisma.$disconnect();
}

try {
  await redis.connect();
  const pong = await redis.ping();
  console.log("✅ Redis connected:", process.env.REDIS_URL, "→", pong);
} catch (e) {
  console.error("❌ Redis failed:", e.message);
} finally {
  redis.disconnect();
}
