import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { deleteAdminEventPhoto } from "@/lib/admin/events/repository";
import { isAuthorizedAdminRequest } from "@/lib/admin/auth";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ eventSlug: string; photoId: string }> },
) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventSlug, photoId } = await context.params;
  const result = await deleteAdminEventPhoto({ eventSlug, photoId });

  if (result.status === "failed") {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
