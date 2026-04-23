import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { extractRequestId, resolveAdminIdentity } from "@/lib/admin/auth";
import {
  AdminReadBackendError,
  reprocessAdminEventPhotosViaBackend,
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

  const { eventSlug } = await context.params;

  try {
    const summary = await reprocessAdminEventPhotosViaBackend({ eventSlug });
    if (!summary) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json(summary);
  } catch (error) {
    const requestId = extractRequestId(request.headers) ?? null;
    const databaseError = isDatabaseErrorLike(error) ? describeDatabaseError(error) : null;
    const backendError = error instanceof AdminReadBackendError ? error : null;
    console.error(
      JSON.stringify({
        scope: "admin-photos-reprocess-api",
        level: "error",
        message: "Failed to reprocess admin event photos",
        requestPath: request.nextUrl.pathname,
        requestId,
        eventSlug,
        actorSub: actor.sub,
        operation: "reprocessAdminEventPhotos",
        backendMode: backendError?.details.backend ?? null,
        troubleshootingHint:
          "Check Lambda invoke permission, Lambda operation support, event photo object keys, and event-photos S3 permissions.",
        database: databaseError,
        backend: backendError
          ? {
              message: backendError.message,
              statusCode: backendError.statusCode,
              details: backendError.details,
            }
          : null,
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
      }),
    );
    return NextResponse.json(
      {
        error: databaseError?.message ?? backendError?.message ?? "Failed to reprocess photos",
        requestId,
      },
      { status: databaseError?.status ?? backendError?.statusCode ?? 500 },
    );
  }
}
