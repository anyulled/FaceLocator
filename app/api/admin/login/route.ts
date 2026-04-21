import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { buildCognitoAuthorizeUrl, isCognitoHostedUiConfigured } from "@/lib/admin/auth";

export async function GET(request: NextRequest) {
  if (!isCognitoHostedUiConfigured()) {
    return NextResponse.json(
      { error: "Cognito hosted UI is not configured" },
      { status: 503 },
    );
  }

  const redirectPath = request.nextUrl.searchParams.get("redirect") || "/admin/events";
  const normalizedRedirectPath = redirectPath.startsWith("/") ? redirectPath : "/admin/events";
  const loginUrl = buildCognitoAuthorizeUrl(normalizedRedirectPath);

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
