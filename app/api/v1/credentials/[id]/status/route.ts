import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth/validateApiKey";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const credential = await prisma.credential.findUnique({
    where: { credential_id: id },
  });

  if (!credential) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const response: Record<string, unknown> = {
    credential_id: credential.credential_id,
    status: credential.status.toLowerCase(),
    updated_at: credential.updated_at,
  };

  if (credential.status === "COMPLETED") {
    response.badge_png_url = credential.badge_png_url;
    response.badge_svg_url = credential.badge_svg_url;
    response.verification_url = credential.verification_url;
    response.edc_share_url = credential.edc_share_url;
    response.linkedin = {
      name: `${credential.course_title} — European Digital Credential`,
      organization: credential.organization,
      issue_date: credential.completion_date.slice(0, 7),
      credential_id: credential.credential_id,
      credential_url: credential.verification_url,
    };
  }

  return NextResponse.json(response);
}
