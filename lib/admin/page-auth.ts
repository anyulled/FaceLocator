import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { resolveAdminIdentityFromToken } from "@/lib/admin/auth";

function buildLoginRedirect(pathname: string) {
  return `/admin/login?redirect=${encodeURIComponent(pathname)}`;
}

export async function requireAdminPageAccess(pathname: string) {
  const cookieStore = await cookies();
  const token =
    cookieStore.get("idToken")?.value ??
    cookieStore.get("accessToken")?.value ??
    null;

  if (!token) {
    redirect(buildLoginRedirect(pathname));
  }

  const headerStore = await headers();
  const requestId =
    headerStore.get("x-amz-cf-id") ??
    headerStore.get("x-amzn-requestid") ??
    headerStore.get("x-correlation-id") ??
    undefined;

  const identity = await resolveAdminIdentityFromToken(token, {
    source: "page",
    requestPath: pathname,
    requestId,
  });

  if (!identity) {
    redirect(buildLoginRedirect(pathname));
  }

  return identity;
}
