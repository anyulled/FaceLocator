import type { NextRequest } from "next/server";

export const ADMIN_AUTH_COOKIE_NAME = "face_locator_admin_token";

export function getAdminToken() {
  return process.env.FACE_LOCATOR_ADMIN_TOKEN || "";
}

export function isAdminTokenConfigured() {
  return getAdminToken().length > 0;
}

export function isAuthorizedAdminToken(token: string | null | undefined) {
  const expectedToken = getAdminToken();
  if (!expectedToken) {
    return false;
  }

  return token === expectedToken;
}

export function extractAdminTokenFromRequest(request: NextRequest) {
  const headerToken = request.headers.get("x-admin-token");
  if (headerToken) {
    return headerToken;
  }

  return request.cookies.get(ADMIN_AUTH_COOKIE_NAME)?.value ?? null;
}

export function isAuthorizedAdminRequest(request: NextRequest) {
  return isAuthorizedAdminToken(extractAdminTokenFromRequest(request));
}
