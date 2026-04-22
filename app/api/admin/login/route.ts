import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  buildCognitoAuthorizeUrl,
  encodeAdminAuthState,
  getCognitoClientId,
  getCognitoOpenIdConfiguration,
  getCognitoLoginRedirectUri,
  getCognitoTokenRedirectUri,
  isAllowedDesktopHandoffUrl,
  parseAdminAuthResponseMode,
} from "@/lib/admin/auth";

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

async function getAuthorizationEndpointFromIssuer() {
  const payload = await getCognitoOpenIdConfiguration();
  return payload?.authorization_endpoint ?? null;
}

export async function GET(request: NextRequest) {
  const redirectPath = request.nextUrl.searchParams.get("redirect") || "/admin/events";
  const normalizedRedirectPath = redirectPath.startsWith("/") ? redirectPath : "/admin/events";
  const responseMode = parseAdminAuthResponseMode(request.nextUrl.searchParams.get("responseMode"));
  const handoffUrl = request.nextUrl.searchParams.get("handoff");
  const normalizedHandoffUrl =
    responseMode === "token" && handoffUrl && isAllowedDesktopHandoffUrl(handoffUrl)
      ? handoffUrl
      : undefined;
  const requestOrigin = resolveRequestOrigin(request);
  let loginUrl = buildCognitoAuthorizeUrl(
    normalizedRedirectPath,
    requestOrigin,
    responseMode,
    normalizedHandoffUrl,
  );

  if (!loginUrl) {
    const authorizationEndpoint = await getAuthorizationEndpointFromIssuer();
    if (authorizationEndpoint) {
      const clientId = getCognitoClientId();
      const redirectUri =
        responseMode === "token"
          ? getCognitoTokenRedirectUri(requestOrigin)
          : getCognitoLoginRedirectUri(requestOrigin);
      if (clientId) {
        const url = new URL(authorizationEndpoint);
        url.searchParams.set("client_id", clientId);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", "openid email profile");
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set(
          "state",
          encodeAdminAuthState(normalizedRedirectPath, normalizedHandoffUrl),
        );
        loginUrl = url.toString();
      }
    }
  }

  if (!loginUrl) {
    return NextResponse.json(
      { error: "Unable to build Cognito authorize URL" },
      { status: 503 },
    );
  }

  return NextResponse.redirect(loginUrl);
}

export async function POST() {
  return NextResponse.json(
    {
      error: "Use GET /api/admin/login for Cognito sign-in redirect.",
    },
    { status: 405 },
  );
}
