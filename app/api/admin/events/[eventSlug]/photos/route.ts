import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { parsePaginationQuery } from "@/lib/admin/events/contracts";
import {
  AdminReadBackendError,
  getAdminEventPhotosPageViaBackend,
} from "@/lib/admin/events/backend";
import { isAuthorizedAdminRequest } from "@/lib/admin/auth";
import { describeDatabaseError, isDatabaseErrorLike } from "@/lib/aws/database-errors";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ eventSlug: string }> },
) {
  if (!(await isAuthorizedAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventSlug } = await context.params;

  const parsed = parsePaginationQuery({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid pagination" }, { status: 400 });
  }

  try {
    const photosPage = await getAdminEventPhotosPageViaBackend({
      eventSlug,
      ...parsed.data,
    });

    if (!photosPage.event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...photosPage,
    });
  } catch (error) {
    const requestId = request.headers.get("x-amz-cf-id") ?? request.headers.get("x-amzn-requestid") ?? request.headers.get("x-correlation-id") ?? null;
    const databaseError = isDatabaseErrorLike(error) ? describeDatabaseError(error) : null;
    const backendError = error instanceof AdminReadBackendError ? error : null;
    console.error(
      JSON.stringify({
        scope: "admin-event-photos-api",
        level: "error",
        message: "Failed to load admin event photos",
        requestPath: request.nextUrl.pathname,
        requestId,
        eventSlug,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
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
        error: databaseError?.message ?? backendError?.message ?? "Failed to load photos",
        requestId,
      },
      { status: databaseError?.status ?? backendError?.statusCode ?? 503 },
    );
  }
}
