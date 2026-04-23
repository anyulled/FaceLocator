import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { extractRequestId, resolveAdminIdentity } from "@/lib/admin/auth";
import {
  AdminReadBackendError,
  sendMatchedPhotoNotificationViaBackend,
} from "@/lib/admin/events/backend";
import { describeDatabaseError, isDatabaseErrorLike } from "@/lib/aws/database-errors";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventSlug: string }> },
) {
  const actor = await resolveAdminIdentity(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const attendeeId =
    payload && typeof payload === "object" && "attendeeId" in payload
      ? String((payload as { attendeeId?: unknown }).attendeeId ?? "").trim()
      : "";

  if (!attendeeId) {
    return NextResponse.json({ error: "attendeeId is required" }, { status: 400 });
  }

  const { eventSlug } = await context.params;

  try {
    const summary = await sendMatchedPhotoNotificationViaBackend({
      eventSlug,
      attendeeId,
      forceResend: true,
    });

    if (summary.sent > 0) {
      return NextResponse.json({
        ...summary,
        message: "Notification email sent",
      });
    }

    if (summary.scanned === 0 || summary.reason === "candidate_not_found") {
      return NextResponse.json(
        {
          ...summary,
          error: "No matched face candidate found for this attendee in this event",
        },
        { status: 404 },
      );
    }

    if (summary.scanned > 0 && summary.sent === 0 && summary.failed > 0) {
      return NextResponse.json(
        {
          ...summary,
          error: "Internal error sending notifications",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ...summary,
        error: "Notification could not be sent",
      },
      { status: 409 },
    );
  } catch (error) {
    const requestId = extractRequestId(request.headers) ?? null;
    const databaseError = isDatabaseErrorLike(error) ? describeDatabaseError(error) : null;
    const backendError = error instanceof AdminReadBackendError ? error : null;

    console.error(
      JSON.stringify({
        scope: "admin-photos-notify-api",
        level: "error",
        message: "Failed to send matched-photo notification",
        requestPath: request.nextUrl.pathname,
        requestId,
        eventSlug,
        attendeeId,
        actorSub: actor.sub,
        operation: "sendSingleNotification",
        backendMode: backendError?.details.backend ?? null,
        troubleshootingHint:
          "Check notifier Lambda invoke permission, SES sender verification, and candidate match availability.",
        database: databaseError,
        backend: backendError
          ? {
              message: backendError.message,
              statusCode: backendError.statusCode,
              details: backendError.details,
            }
          : null,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
      }),
    );

    return NextResponse.json(
      {
        error: databaseError?.message ?? backendError?.message ?? "Failed to send notification",
        requestId,
      },
      { status: databaseError?.status ?? backendError?.statusCode ?? 500 },
    );
  }
}
