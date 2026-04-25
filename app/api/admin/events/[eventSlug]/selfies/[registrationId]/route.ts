import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { deleteAdminEventSelfie } from "@/lib/admin/events/repository";
import { resolveAdminIdentity } from "@/lib/admin/auth";
import { describeDatabaseError, isDatabaseErrorLike } from "@/lib/aws/database-errors";

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
    const result = await deleteAdminEventSelfie({
      eventSlug,
      registrationId,
      actorSub: actor.sub,
    });

    if (result.status === "failed") {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const requestId = request.headers.get("x-amz-cf-id") ?? request.headers.get("x-amzn-requestid") ?? request.headers.get("x-correlation-id") ?? null;
    const databaseError = isDatabaseErrorLike(error) ? describeDatabaseError(error) : null;
    console.error(
      JSON.stringify({
        scope: "admin-delete-selfie-api",
        level: "error",
        message: "Failed to delete admin event selfie/attendee",
        requestPath: request.nextUrl.pathname,
        requestId,
        eventSlug,
        registrationId,
        database: databaseError,
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
      }),
    );
    return NextResponse.json(
      {
        error: databaseError?.message ?? "Failed to delete selfie/attendee",
        requestId,
      },
      { status: databaseError?.status ?? 500 },
    );
  }
}
