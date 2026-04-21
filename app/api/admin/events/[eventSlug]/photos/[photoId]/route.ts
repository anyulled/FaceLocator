import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { deleteAdminEventPhoto } from "@/lib/admin/events/backend";
import { resolveAdminIdentity } from "@/lib/admin/auth";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ eventSlug: string; photoId: string }> },
) {
  const actor = await resolveAdminIdentity(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventSlug, photoId } = await context.params;
  const result = await deleteAdminEventPhoto({
    eventSlug,
    photoId,
    actorSub: actor.sub,
  });

  if (result.status === "failed") {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
