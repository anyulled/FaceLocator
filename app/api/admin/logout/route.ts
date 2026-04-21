import { NextResponse } from "next/server";

import { buildCognitoLogoutUrl } from "@/lib/admin/auth";

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

export async function GET() {
  const logoutUrl = buildCognitoLogoutUrl();
  const response = logoutUrl
    ? NextResponse.redirect(logoutUrl)
    : NextResponse.redirect("/");

  clearAuthCookies(response);
  return response;
}

export async function POST() {
  return GET();
}
