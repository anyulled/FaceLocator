import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/auth", () => ({
  isCognitoAdminAuthConfigured: vi.fn(),
}));

import { isCognitoAdminAuthConfigured } from "@/lib/admin/auth";
import { middleware } from "@/middleware";

const mockedIsCognitoAdminAuthConfigured = vi.mocked(isCognitoAdminAuthConfigured);

function makeRequest(
  url: string,
  options?: {
    authorization?: string;
    idToken?: string;
    accessToken?: string;
  },
) {
  const headers = new Headers();
  if (options?.authorization) headers.set("authorization", options.authorization);

  const cookies: Record<string, string> = {};
  if (options?.idToken) cookies["idToken"] = options.idToken;
  if (options?.accessToken) cookies["accessToken"] = options.accessToken;

  return {
    nextUrl: new URL(url),
    headers,
    cookies: {
      get(name: string) {
        return name in cookies ? { value: cookies[name] } : undefined;
      },
    },
  } as never;
}

describe("middleware — extended branches", () => {
  beforeEach(() => {
    mockedIsCognitoAdminAuthConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("passes through non-admin paths without auth check", async () => {
    const response = await middleware(makeRequest("https://example.com/events/demo/register"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("returns 503 for admin API when Cognito is not configured", async () => {
    mockedIsCognitoAdminAuthConfigured.mockReturnValue(false);
    const response = await middleware(makeRequest("https://example.com/api/admin/events"));
    expect(response.status).toBe(503);
  });

  it("returns 503 for admin page when Cognito is not configured", async () => {
    mockedIsCognitoAdminAuthConfigured.mockReturnValue(false);
    const response = await middleware(makeRequest("https://example.com/admin/events"));
    expect(response.status).toBe(503);
  });

  it("passes through login path without auth check", async () => {
    const response = await middleware(makeRequest("https://example.com/admin/login"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("passes through callback path without auth check", async () => {
    const response = await middleware(
      makeRequest("https://example.com/api/admin/callback?code=abc"),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("passes through logout path without auth check", async () => {
    const response = await middleware(
      makeRequest("https://example.com/api/admin/logout"),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows admin page access when Bearer token is present", async () => {
    const response = await middleware(
      makeRequest("https://example.com/admin/events", { authorization: "Bearer some-valid-token" }),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows admin API access when idToken cookie is set", async () => {
    const response = await middleware(
      makeRequest("https://example.com/api/admin/events", { idToken: "some-token" }),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows admin API access when accessToken cookie is set", async () => {
    const response = await middleware(
      makeRequest("https://example.com/api/admin/events", { accessToken: "some-token" }),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects admin page to login when no auth token hint", async () => {
    const response = await middleware(makeRequest("https://example.com/admin/events"));
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/admin/login");
    expect(location).toContain("redirect=");
  });

  it("returns 401 for admin API path without auth token hint", async () => {
    const response = await middleware(makeRequest("https://example.com/api/admin/events"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("handles /admin root path", async () => {
    const response = await middleware(makeRequest("https://example.com/admin"));
    expect(response.status).toBe(307);
  });
});
