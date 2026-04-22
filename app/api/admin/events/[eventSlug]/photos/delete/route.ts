import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { parseBatchDeleteInput } from "@/lib/admin/events/contracts";
import { deleteAdminEventPhotosBatch } from "@/lib/admin/events/repository";
import { resolveAdminIdentity } from "@/lib/admin/auth";
import { describeDatabaseError, isDatabaseErrorLike } from "@/lib/aws/database-errors";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventSlug: string }> },
) {
  const actor = await resolveAdminIdentity(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) {
    return NextResponse.json({ error: "Idempotency-Key header is required" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = parseBatchDeleteInput(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { eventSlug } = await context.params;
  try {
    const summary = await deleteAdminEventPhotosBatch({
      eventSlug,
      photoIds: parsed.data.photoIds,
      actorSub: actor.sub,
      idempotencyKey,
    });

    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD") {
      return NextResponse.json(
        { error: "Idempotency-Key cannot be reused with a different payload" },
        { status: 409 },
      );
    }
    const requestId = request.headers.get("x-amz-cf-id") ?? request.headers.get("x-amzn-requestid") ?? request.headers.get("x-correlation-id") ?? null;
    const databaseError = isDatabaseErrorLike(error) ? describeDatabaseError(error) : null;
    console.error(
      JSON.stringify({
        scope: "admin-batch-delete-api",
        level: "error",
        message: "Failed to batch delete admin event photos",
        requestPath: request.nextUrl.pathname,
        requestId,
        eventSlug,
        photoCount: parsed.data.photoIds.length,
        database: databaseError,
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
      }),
    );
    return NextResponse.json(
      {
        error: databaseError?.message ?? "Batch delete failed",
        requestId,
      },
      { status: databaseError?.status ?? 500 },
    );
  }
}
