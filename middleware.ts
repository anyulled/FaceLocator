import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isCognitoAdminAuthConfigured } from "@/lib/admin/auth";

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

function hasAuthTokenHint(request: NextRequest) {
  if (request.cookies.get("idToken")?.value || request.cookies.get("accessToken")?.value) {
    return true;
  }

  const authorizationHeader = request.headers.get("authorization");
  if (!authorizationHeader) {
    return false;
  }

  return /^Bearer\s+.+/i.test(authorizationHeader);
}

function resolveRequestOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProto === "http" || forwardedProto === "https"
    ? forwardedProto
    : "https";

  if (forwardedHost) {
    return `${protocol}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
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

  if (hasAuthTokenHint(request)) {
    return NextResponse.next();
  }

  if (isAdminPath(pathname)) {
    const loginUrl = new URL(ADMIN_LOGIN_PATH, resolveRequestOrigin(request));
    loginUrl.searchParams.set("redirect", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
