import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  ADMIN_AUTH_COOKIE_NAME,
  isAuthorizedAdminToken,
  isAdminTokenConfigured,
} from "@/lib/admin/auth";

export async function POST(request: NextRequest) {
  if (!isAdminTokenConfigured()) {
    return NextResponse.json({ error: "Admin auth is not configured" }, { status: 503 });
  }

  const contentType = request.headers.get("content-type") || "";

  let token: string | null = null;
  let redirectTo = "/admin/events";

  if (contentType.includes("application/json")) {
    const payload = await request.json().catch(() => null);
    token = payload?.token ?? null;
    redirectTo = payload?.redirectTo || redirectTo;
  } else {
    const form = await request.formData();
    token = String(form.get("token") ?? "");
    redirectTo = String(form.get("redirectTo") ?? redirectTo);
  }

  if (!isAuthorizedAdminToken(token)) {
    return NextResponse.json({ error: "Invalid admin token" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, redirectTo });
  response.cookies.set({
    name: ADMIN_AUTH_COOKIE_NAME,
    value: token!,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
