import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  decodeAdminAuthState,
  getCognitoClientId,
  getCognitoHostedDomain,
  getCognitoLoginRedirectUri,
} from "@/lib/admin/auth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
  }

  const domain = getCognitoHostedDomain();
  const clientId = getCognitoClientId();
  const redirectUri = getCognitoLoginRedirectUri();

  if (!domain || !clientId || !redirectUri) {
    return NextResponse.json({ error: "Cognito OAuth configuration is incomplete" }, { status: 503 });
  }

  const tokenEndpoint = `https://${domain}/oauth2/token`;
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Failed to exchange authorization code" }, { status: 401 });
  }

  const payload = (await response.json()) as {
    id_token?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!payload.id_token || !payload.access_token) {
    return NextResponse.json({ error: "Token exchange did not return required tokens" }, { status: 401 });
  }

  const redirectPath = decodeAdminAuthState(request.nextUrl.searchParams.get("state")) || "/admin/events";
  const redirectUrl = new URL(redirectPath, request.url);
  const authMaxAge = Math.max(60, Number(payload.expires_in || 3600));

  const nextResponse = NextResponse.redirect(redirectUrl);
  nextResponse.cookies.set({
    name: "idToken",
    value: payload.id_token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: authMaxAge,
  });
  nextResponse.cookies.set({
    name: "accessToken",
    value: payload.access_token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: authMaxAge,
  });

  if (payload.refresh_token) {
    nextResponse.cookies.set({
      name: "refreshToken",
      value: payload.refresh_token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return nextResponse;
}
