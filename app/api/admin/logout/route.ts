import { NextResponse } from "next/server";

import {
  buildCognitoLogoutUrl,
  getCognitoClientId,
  getCognitoIssuer,
  getCognitoLogoutRedirectUri,
} from "@/lib/admin/auth";

function resolveRequestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProto === "http" || forwardedProto === "https"
    ? forwardedProto
    : "https";

  if (forwardedHost) {
    return `${protocol}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

async function getEndSessionEndpointFromIssuer() {
  const issuer = getCognitoIssuer();
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

  const payload = (await response.json()) as { end_session_endpoint?: string };
  return payload.end_session_endpoint ?? null;
}

function clearAuthCookies(response: NextResponse) {
  const cookieBase = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };

  response.cookies.set({ name: "idToken", value: "", ...cookieBase });
  response.cookies.set({ name: "accessToken", value: "", ...cookieBase });
  response.cookies.set({ name: "refreshToken", value: "", ...cookieBase });
}

export async function GET(request: Request) {
  const requestOrigin = resolveRequestOrigin(request);
  let logoutUrl = buildCognitoLogoutUrl(requestOrigin);
  if (!logoutUrl) {
    const endSessionEndpoint = await getEndSessionEndpointFromIssuer();
    const clientId = getCognitoClientId();
    const logoutUri = getCognitoLogoutRedirectUri(requestOrigin);
    if (endSessionEndpoint && clientId) {
      const url = new URL(endSessionEndpoint);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("logout_uri", logoutUri);
      logoutUrl = url.toString();
    }
  }
  const response = logoutUrl
    ? NextResponse.redirect(logoutUrl)
    : NextResponse.redirect("/");

  clearAuthCookies(response);
  return response;
}

export async function POST(request: Request) {
  return GET(request);
}
