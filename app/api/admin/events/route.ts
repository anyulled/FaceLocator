import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { parseCreateEventInput, parsePaginationQuery } from "@/lib/admin/events/contracts";
import { createAdminEvent, listAdminEvents } from "@/lib/admin/events/repository";
import { isAuthorizedAdminRequest } from "@/lib/admin/auth";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorizedAdminRequest(request))) {
    return unauthorized();
  }

  const parsed = parsePaginationQuery({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid pagination" }, { status: 400 });
  }

  const result = await listAdminEvents(parsed.data);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorizedAdminRequest(request))) {
    return unauthorized();
  }

  const json = await request.json().catch(() => null);
  const parsed = parseCreateEventInput(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const event = await createAdminEvent(parsed.data);
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    const isDuplicate =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23505";

    if (isDuplicate) {
      return NextResponse.json({ error: "An event with this slug already exists" }, { status: 409 });
    }

    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }
}
