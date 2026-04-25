import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { extractRequestId as extractAuthRequestId, resolveAdminIdentity } from "@/lib/admin/auth";
import { reprocessAdminEventPhotosViaBackend } from "@/lib/admin/events/backend";
import { buildAdminErrorResponse } from "@/lib/admin/events/route-utils";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventSlug: string }> },
) {
  const actor = await resolveAdminIdentity(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventSlug } = await context.params;

  try {
    const summary = await reprocessAdminEventPhotosViaBackend({ eventSlug });
    if (!summary) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json(summary);
  } catch (error) {
    return buildAdminErrorResponse({
      error,
      scope: "admin-photos-reprocess-api",
      requestPath: request.nextUrl.pathname,
      requestId: extractAuthRequestId(request.headers) ?? null,
      defaultMessage: "Failed to reprocess photos",
      defaultStatus: 500,
      context: { eventSlug, actorSub: actor.sub },
    });
  }
}
