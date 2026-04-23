import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/auth", () => ({
  isCognitoAdminAuthConfigured: vi.fn(() => true),
}));

import { middleware } from "@/middleware";

type MockCookieStore = {
  get: (name: string) => { value: string } | undefined;
};

function makeRequest(
  url: string,
  options?: {
    authorization?: string;
    cookieTokens?: { idToken?: string; accessToken?: string };
  },
) {
  const headers = new Headers();
  if (options?.authorization) {
    headers.set("authorization", options.authorization);
  }

  const cookieStore: MockCookieStore = {
    get(name: string) {
      const tokens = options?.cookieTokens;
      if (!tokens) {
        return undefined;
      }
      if (name === "idToken" && tokens.idToken) {
        return { value: tokens.idToken };
      }
      if (name === "accessToken" && tokens.accessToken) {
        return { value: tokens.accessToken };
      }
      return undefined;
    },
  };

  return {
    nextUrl: new URL(url),
    headers,
    cookies: cookieStore,
  } as never;
}

describe("admin middleware", () => {
  it("allows token callback path without prior auth token hints", async () => {
    const response = await middleware(
      makeRequest("https://example.com/api/admin/token-callback?code=demo&state=demo"),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("still rejects protected admin api paths without auth token hints", async () => {
    const response = await middleware(makeRequest("https://example.com/api/admin/events"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });
});
