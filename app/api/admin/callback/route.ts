import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  decodeAdminAuthState,
  exchangeCognitoAuthorizationCode,
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

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
  }

  let exchanged;
  try {
    exchanged = await exchangeCognitoAuthorizationCode({
      code,
      origin: resolveRequestOrigin(request),
      responseMode: "cookie",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "COGNITO_TOKEN_EXCHANGE_FAILED";
    return NextResponse.json(
      { error: message === "COGNITO_OAUTH_CONFIGURATION_INCOMPLETE" ? "Cognito OAuth configuration is incomplete" : "Failed to exchange authorization code" },
      { status: message === "COGNITO_OAUTH_CONFIGURATION_INCOMPLETE" ? 503 : 401 },
    );
  }

  const redirectPath = decodeAdminAuthState(request.nextUrl.searchParams.get("state")) || "/admin/events";
  const redirectUrl = new URL(redirectPath, resolveRequestOrigin(request));
  const authMaxAge = exchanged.expiresIn;

  const nextResponse = NextResponse.redirect(redirectUrl);
  nextResponse.cookies.set({
    name: "idToken",
    value: exchanged.idToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: authMaxAge,
  });
  nextResponse.cookies.set({
    name: "accessToken",
    value: exchanged.accessToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: authMaxAge,
  });

  if (exchanged.refreshToken) {
    nextResponse.cookies.set({
      name: "refreshToken",
      value: exchanged.refreshToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return nextResponse;
}
