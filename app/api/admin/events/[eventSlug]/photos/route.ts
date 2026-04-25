import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { parsePaginationQuery } from "@/lib/admin/events/contracts";
import { getAdminEventPhotosPageViaBackend } from "@/lib/admin/events/backend";
import { isAuthorizedAdminRequest } from "@/lib/admin/auth";
import { buildAdminErrorResponse, extractRequestId } from "@/lib/admin/events/route-utils";

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

    return NextResponse.json({ ...photosPage });
  } catch (error) {
    return buildAdminErrorResponse({
      error,
      scope: "admin-event-photos-api",
      requestPath: request.nextUrl.pathname,
      requestId: extractRequestId(request.headers),
      defaultMessage: "Failed to load photos",
      defaultStatus: 503,
      context: { eventSlug, page: parsed.data.page, pageSize: parsed.data.pageSize },
    });
  }
}
