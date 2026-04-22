import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  escapeHtmlAttribute,
  exchangeCognitoAuthorizationCode,
  extractRequestId,
  parseAdminAuthState,
  resolveRequestOrigin,
  resolveAdminIdentityFromToken,
} from "@/lib/admin/auth";

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
      responseMode: "token",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "COGNITO_TOKEN_EXCHANGE_FAILED";
    return NextResponse.json(
      { error: message === "COGNITO_OAUTH_CONFIGURATION_INCOMPLETE" ? "Cognito OAuth configuration is incomplete" : "Failed to exchange authorization code" },
      { status: message === "COGNITO_OAUTH_CONFIGURATION_INCOMPLETE" ? 503 : 401 },
    );
  }

  const admin = await resolveAdminIdentityFromToken(exchanged.accessToken, {
    source: "api",
    requestPath: request.nextUrl.pathname,
    requestId: extractRequestId(request.headers),
  });

  if (!admin) {
    return NextResponse.json({ error: "Admin access is required" }, { status: 401 });
  }

  const authState = parseAdminAuthState(request.nextUrl.searchParams.get("state"));
  if (authState?.handoffUrl) {
    const expiresAt = new Date(Date.now() + exchanged.expiresIn * 1000).toISOString();
    const usernameInput = admin.username
      ? `<input type="hidden" name="username" value="${escapeHtmlAttribute(admin.username)}" />`
      : "";
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Cache-Control" content="no-store" />
    <title>Face Uploader Sign-in</title>
  </head>
  <body>
    <form id="desktop-handoff" method="post" action="${escapeHtmlAttribute(authState.handoffUrl)}">
      <input type="hidden" name="accessToken" value="${escapeHtmlAttribute(exchanged.accessToken)}" />
      <input type="hidden" name="expiresIn" value="${String(exchanged.expiresIn)}" />
      <input type="hidden" name="expiresAt" value="${escapeHtmlAttribute(expiresAt)}" />
      <input type="hidden" name="sub" value="${escapeHtmlAttribute(admin.sub)}" />
      ${usernameInput}
    </form>
    <p>Completing sign-in for Face Uploader…</p>
    <script>document.getElementById("desktop-handoff")?.submit();</script>
  </body>
</html>`;
    return new NextResponse(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
        pragma: "no-cache",
      },
    });
  }

  return NextResponse.json(
    {
      tokenType: "Bearer",
      accessToken: exchanged.accessToken,
      expiresIn: exchanged.expiresIn,
      expiresAt: new Date(Date.now() + exchanged.expiresIn * 1000).toISOString(),
      redirectPath: authState?.redirectPath || "/admin/events",
      admin: {
        sub: admin.sub,
        username: admin.username,
        groups: admin.groups,
      },
    },
    {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
        pragma: "no-cache",
      },
    },
  );
}
