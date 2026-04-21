import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { parseCreateEventInput, parsePaginationQuery } from "@/lib/admin/events/contracts";
import { createAdminEvent, listAdminEvents } from "@/lib/admin/events/repository";
import { isAuthorizedAdminRequest } from "@/lib/admin/auth";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function getRequestId(request: NextRequest) {
  return (
    request.headers.get("x-amz-cf-id") ??
    request.headers.get("x-amzn-requestid") ??
    request.headers.get("x-correlation-id") ??
    null
  );
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

  try {
    const result = await listAdminEvents(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    const requestId = getRequestId(request);
    console.error(
      JSON.stringify({
        scope: "admin-events-api",
        level: "error",
        message: "Failed to list admin events",
        requestPath: request.nextUrl.pathname,
        requestId,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
      }),
    );
    return NextResponse.json(
      { error: "Failed to list events", requestId },
      { status: 503 },
    );
  }
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
    const requestId = getRequestId(request);
    const isDuplicate =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23505";

    if (isDuplicate) {
      return NextResponse.json({ error: "An event with this slug already exists" }, { status: 409 });
    }

    console.error(
      JSON.stringify({
        scope: "admin-events-api",
        level: "error",
        message: "Failed to create admin event",
        requestPath: request.nextUrl.pathname,
        requestId,
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
      }),
    );
    return NextResponse.json({ error: "Failed to create event", requestId }, { status: 500 });
  }
}
