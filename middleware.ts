import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isAuthorizedAdminRequest, isCognitoAdminAuthConfigured } from "@/lib/admin/auth";

const ADMIN_LOGIN_PATH = "/admin/login";
const ADMIN_LOGIN_API_PATH = "/api/admin/login";
const ADMIN_CALLBACK_API_PATH = "/api/admin/callback";
const ADMIN_LOGOUT_API_PATH = "/api/admin/logout";

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isAdminApiPath(pathname: string) {
  return pathname.startsWith("/api/admin/");
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isAdminPath(pathname) && !isAdminApiPath(pathname)) {
    return NextResponse.next();
  }

  if (
    pathname === ADMIN_LOGIN_PATH ||
    pathname === ADMIN_LOGIN_API_PATH ||
    pathname === ADMIN_CALLBACK_API_PATH ||
    pathname === ADMIN_LOGOUT_API_PATH
  ) {
    return NextResponse.next();
  }

  if (!isCognitoAdminAuthConfigured()) {
    const body = { error: "Cognito admin auth is not configured" };
    if (isAdminApiPath(pathname)) {
      return NextResponse.json(body, { status: 503 });
    }
    return new NextResponse(body.error, { status: 503 });
  }

  const authorized = await isAuthorizedAdminRequest(request);
  if (authorized) {
    return NextResponse.next();
  }

  if (isAdminPath(pathname)) {
    const loginUrl = new URL(ADMIN_LOGIN_PATH, request.url);
    loginUrl.searchParams.set("redirect", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
