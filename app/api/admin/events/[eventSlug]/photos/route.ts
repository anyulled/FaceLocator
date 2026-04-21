import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { parsePaginationQuery } from "@/lib/admin/events/contracts";
import { getAdminEventHeader, listAdminEventPhotos } from "@/lib/admin/events/repository";
import { isAuthorizedAdminRequest } from "@/lib/admin/auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ eventSlug: string }> },
) {
  if (!isAuthorizedAdminRequest(request)) {
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

  const [event, photosPage] = await Promise.all([
    getAdminEventHeader(eventSlug),
    listAdminEventPhotos({
      eventSlug,
      ...parsed.data,
    }),
  ]);

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({
    event,
    ...photosPage,
  });
}
