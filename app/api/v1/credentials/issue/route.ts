import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateApiKey } from "@/lib/auth/validateApiKey";
import { prisma } from "@/lib/db/prisma";
import { validateQueue } from "@/lib/queue/index";

const schema = z.object({
  idempotency_key: z.string().min(1),
  participant: z.object({
    full_name: z.string().min(2),
    email: z.string().email(),
  }),
  course: z.object({
    course_code: z.string().min(1),
    course_title: z.string().min(1),
    duration_hours: z.number().int().positive(),
    completion_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    result: z.string().optional(),
  }),
});

export async function POST(req: NextRequest) {
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 });
  }

  const { idempotency_key, participant, course } = parsed.data;

  // Idempotency check
  const existing = await prisma.credential.findUnique({ where: { idempotency_key } });
  if (existing) {
    return NextResponse.json({
      status: existing.status.toLowerCase(),
      credential_id: existing.credential_id,
      current_status: existing.status.toLowerCase(),
      status_check_url: `/api/v1/credentials/${existing.credential_id}/status`,
    }, { status: 200 });
  }

  // Generate credential_id: A04-{YEAR}-{4-digit sequence}
  const year = new Date().getFullYear();
  const prefix = `A04-${year}-`;
  const count = await prisma.credential.count({
    where: { credential_id: { startsWith: prefix } },
  });
  const credential_id = `${prefix}${String(count + 1).padStart(4, "0")}`;

  const credential = await prisma.credential.create({
    data: {
      credential_id,
      idempotency_key,
      status: "REQUESTED",
      participant_name: participant.full_name,
      participant_email: participant.email,
      course_code: course.course_code,
      course_title: course.course_title,
      duration_hours: course.duration_hours,
      completion_date: course.completion_date,
      result: course.result,
      organization: "Atelier04 ESKE GmbH",
      country: "AT",
      verification_url: `${process.env.ATELIER04_VERIFICATION_BASE}/${credential_id}`,
    },
  });

  await validateQueue.add("validate", { credentialDbId: credential.id });

  return NextResponse.json({
    status: "accepted",
    credential_id,
    current_status: "requested",
    status_check_url: `/api/v1/credentials/${credential_id}/status`,
  }, { status: 202 });
}
