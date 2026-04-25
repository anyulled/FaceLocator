import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { extractRequestId as extractAuthRequestId, resolveAdminIdentity } from "@/lib/admin/auth";
import { parseAdminPhotoPresignInput } from "@/lib/admin/events/contracts";
import { createAdminEventPhotoUploadViaBackend } from "@/lib/admin/events/backend";
import { buildAdminErrorResponse } from "@/lib/admin/events/route-utils";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventSlug: string }> },
) {
  const actor = await resolveAdminIdentity(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = parseAdminPhotoPresignInput(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { eventSlug } = await context.params;
  try {
    const upload = await createAdminEventPhotoUploadViaBackend({
      eventSlug,
      contentType: parsed.data.contentType,
      uploadedBy: actor.sub,
    });

    if (!upload) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json(upload);
  } catch (error) {
    return buildAdminErrorResponse({
      error,
      scope: "admin-photo-presign-api",
      requestPath: request.nextUrl.pathname,
      requestId: extractAuthRequestId(request.headers) ?? null,
      defaultMessage: "Failed to create upload contract",
      defaultStatus: 500,
      context: { eventSlug, actorSub: actor.sub },
    });
  }
}
