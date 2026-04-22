import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  exchangeCognitoAuthorizationCode,
  parseAdminAuthState,
  resolveAdminIdentityFromToken,
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
    requestId:
      request.headers.get("x-amz-cf-id") ??
      request.headers.get("x-amzn-requestid") ??
      request.headers.get("x-correlation-id") ??
      undefined,
  });

  if (!admin) {
    return NextResponse.json({ error: "Admin access is required" }, { status: 401 });
  }

  const authState = parseAdminAuthState(request.nextUrl.searchParams.get("state"));
  if (authState?.handoffUrl) {
    const expiresAt = new Date(Date.now() + exchanged.expiresIn * 1000).toISOString();
    const usernameInput = admin.username
      ? `<input type="hidden" name="username" value="${admin.username.replaceAll("\"", "&quot;")}" />`
      : "";
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Cache-Control" content="no-store" />
    <title>Face Uploader Sign-in</title>
  </head>
  <body>
    <form id="desktop-handoff" method="post" action="${authState.handoffUrl}">
      <input type="hidden" name="accessToken" value="${exchanged.accessToken.replaceAll("\"", "&quot;")}" />
      <input type="hidden" name="expiresIn" value="${String(exchanged.expiresIn)}" />
      <input type="hidden" name="expiresAt" value="${expiresAt}" />
      <input type="hidden" name="sub" value="${admin.sub.replaceAll("\"", "&quot;")}" />
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
