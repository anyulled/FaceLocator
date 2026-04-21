import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { buildCognitoAuthorizeUrl } from "@/lib/admin/auth";

async function getAuthorizationEndpointFromIssuer() {
  const issuer = process.env.COGNITO_ISSUER?.trim();
  if (!issuer) {
    return null;
  }

  const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { authorization_endpoint?: string };
  return payload.authorization_endpoint ?? null;
}

export async function GET(request: NextRequest) {
  const redirectPath = request.nextUrl.searchParams.get("redirect") || "/admin/events";
  const normalizedRedirectPath = redirectPath.startsWith("/") ? redirectPath : "/admin/events";
  let loginUrl = buildCognitoAuthorizeUrl(normalizedRedirectPath);

  if (!loginUrl) {
    const authorizationEndpoint = await getAuthorizationEndpointFromIssuer();
    if (authorizationEndpoint) {
      const clientId = process.env.COGNITO_APP_CLIENT_ID?.trim();
      const redirectUri = `${process.env.FACE_LOCATOR_PUBLIC_BASE_URL || "http://localhost:3000"}/api/admin/callback`;
      if (clientId) {
        const url = new URL(authorizationEndpoint);
        url.searchParams.set("client_id", clientId);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", "openid email profile");
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set(
          "state",
          Buffer.from(JSON.stringify({ redirectPath: normalizedRedirectPath }), "utf8").toString(
            "base64url",
          ),
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
