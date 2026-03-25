import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const ids = ["A04-2026-0001", "A04-2026-0002", "A04-2026-0003"];

async function main() {
  for (const credential_id of ids) {
    const c = await prisma.credential.findUnique({ where: { credential_id } });
    if (!c) {
      console.log(`${credential_id} — not found, skipping`);
      continue;
    }
    await prisma.$transaction([
      prisma.credential.update({
        where: { credential_id },
        data: { status: "FAILED" },
      }),
      prisma.auditLog.create({
        data: {
          credential_id: c.id,
          from_status: c.status,
          to_status: "FAILED",
          reason: "test record - pipeline incomplete at time of creation",
        },
      }),
    ]);
    console.log(`${credential_id} — ✅ updated ${c.status} → FAILED`);
  }
  await prisma.$disconnect();
}

main();
