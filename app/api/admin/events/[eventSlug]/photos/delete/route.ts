import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { parseBatchDeleteInput } from "@/lib/admin/events/contracts";
import { deleteAdminEventPhotosBatch } from "@/lib/admin/events/repository";
import { isAuthorizedAdminRequest } from "@/lib/admin/auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventSlug: string }> },
) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = parseBatchDeleteInput(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { eventSlug } = await context.params;
  const results = await deleteAdminEventPhotosBatch({
    eventSlug,
    photoIds: parsed.data.photoIds,
  });

  return NextResponse.json({
    results,
    deleted: results.filter((item) => item.status === "deleted").length,
    notFound: results.filter((item) => item.status === "not_found").length,
    failed: results.filter((item) => item.status === "failed").length,
  });
}
