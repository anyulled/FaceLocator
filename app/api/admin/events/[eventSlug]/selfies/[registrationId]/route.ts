import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { deleteAdminEventAttendee } from "@/lib/admin/events/repository";
import { resolveAdminIdentity } from "@/lib/admin/auth";
import { buildAdminErrorResponse, extractRequestId } from "@/lib/admin/events/route-utils";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ eventSlug: string; registrationId: string }> },
) {
  const actor = await resolveAdminIdentity(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventSlug, registrationId } = await context.params;
  try {
    const result = await deleteAdminEventAttendee({
      eventSlug,
      registrationId,
      actorSub: actor.sub,
    });

    if (result.status === "failed") {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return buildAdminErrorResponse({
      error,
      scope: "admin-delete-selfie-api",
      requestPath: request.nextUrl.pathname,
      requestId: extractRequestId(request.headers),
      defaultMessage: "Failed to delete selfie/attendee",
      defaultStatus: 500,
      context: { eventSlug, registrationId },
    });
  }
}
