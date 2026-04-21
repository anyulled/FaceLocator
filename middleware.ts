import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isAuthorizedAdminRequest, isAdminTokenConfigured } from "@/lib/admin/auth";

const ADMIN_LOGIN_PATH = "/admin/login";
const ADMIN_LOGIN_API_PATH = "/api/admin/login";

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isAdminApiPath(pathname: string) {
  return pathname.startsWith("/api/admin/");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isAdminPath(pathname) && !isAdminApiPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname === ADMIN_LOGIN_PATH || pathname === ADMIN_LOGIN_API_PATH) {
    return NextResponse.next();
  }

  if (!isAdminTokenConfigured()) {
    return new NextResponse("Admin access is not configured", { status: 503 });
  }

  if (isAuthorizedAdminRequest(request)) {
    return NextResponse.next();
  }

  if (isAdminPath(pathname)) {
    const loginUrl = new URL(ADMIN_LOGIN_PATH, request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
