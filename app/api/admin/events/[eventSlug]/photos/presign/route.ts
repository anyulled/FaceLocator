import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { extractRequestId, resolveAdminIdentity } from "@/lib/admin/auth";
import { parseAdminPhotoPresignInput } from "@/lib/admin/events/contracts";
import { createAdminEventPhotoUpload } from "@/lib/admin/events/repository";
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
  const parsed = parseAdminPhotoPresignInput(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { eventSlug } = await context.params;
  try {
    const upload = await createAdminEventPhotoUpload({
      eventSlug,
      contentType: parsed.data.contentType,
      uploadedBy: actor.sub,
    });

    if (!upload) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json(upload);
  } catch (error) {
    const requestId = extractRequestId(request.headers) ?? null;
    const databaseError = isDatabaseErrorLike(error) ? describeDatabaseError(error) : null;
    console.error(
      JSON.stringify({
        scope: "admin-photo-presign-api",
        level: "error",
        message: "Failed to create admin photo upload contract",
        requestPath: request.nextUrl.pathname,
        requestId,
        eventSlug,
        actorSub: actor.sub,
        database: databaseError,
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
      }),
    );
    return NextResponse.json(
      {
        error: databaseError?.message ?? "Failed to create upload contract",
        requestId,
      },
      { status: databaseError?.status ?? 500 },
    );
  }
}
