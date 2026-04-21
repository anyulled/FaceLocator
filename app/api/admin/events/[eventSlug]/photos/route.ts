import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { parsePaginationQuery } from "@/lib/admin/events/contracts";
import { getAdminEventPhotosPage } from "@/lib/admin/events/backend";
import { isAuthorizedAdminRequest } from "@/lib/admin/auth";

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

  const response = await getAdminEventPhotosPage({
    eventSlug,
    ...parsed.data,
  });

  if (!response.event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({
    event: response.event,
    photos: response.photos,
    page: response.page,
    pageSize: response.pageSize,
    totalCount: response.totalCount,
  });
}
