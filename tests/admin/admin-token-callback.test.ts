import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/auth", () => ({
  exchangeCognitoAuthorizationCode: vi.fn(),
  parseAdminAuthState: vi.fn(),
  resolveAdminIdentityFromToken: vi.fn(),
}));

import { GET as tokenCallback } from "@/app/api/admin/token-callback/route";
import {
  exchangeCognitoAuthorizationCode,
  parseAdminAuthState,
  resolveAdminIdentityFromToken,
} from "@/lib/admin/auth";

const mockedParseAdminAuthState = vi.mocked(parseAdminAuthState);
const mockedExchange = vi.mocked(exchangeCognitoAuthorizationCode);
const mockedResolveIdentity = vi.mocked(resolveAdminIdentityFromToken);

function makeNextRequest(url: string) {
  return Object.assign(new Request(url), {
    nextUrl: new URL(url),
  }) as never;
}

describe("admin token callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedParseAdminAuthState.mockReturnValue({ redirectPath: "/admin/events" });
  });

  it("returns 400 when code is missing", async () => {
    const response = await tokenCallback(makeNextRequest("http://localhost/api/admin/token-callback"));
    expect(response.status).toBe(400);
  });

  it("returns bearer credentials when exchange succeeds", async () => {
    mockedExchange.mockResolvedValue({
      idToken: "id-token",
      accessToken: "access-token",
      refreshToken: null,
      expiresIn: 3600,
    });
    mockedResolveIdentity.mockResolvedValue({
      sub: "admin-user-1",
      tokenUse: "access",
      groups: ["admin"],
      username: "ops@example.com",
    });

    const response = await tokenCallback(
      makeNextRequest("http://localhost/api/admin/token-callback?code=demo&state=state"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tokenType: "Bearer",
      accessToken: "access-token",
      admin: {
        sub: "admin-user-1",
      },
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("returns a no-store html handoff page when a desktop handoff url is present", async () => {
    mockedParseAdminAuthState.mockReturnValue({
      redirectPath: "/admin/events",
      handoffUrl: "http://127.0.0.1:9999/callback",
    });
    mockedExchange.mockResolvedValue({
      idToken: "id-token",
      accessToken: "access-token",
      refreshToken: null,
      expiresIn: 3600,
    });
    mockedResolveIdentity.mockResolvedValue({
      sub: "admin-user-1",
      tokenUse: "access",
      groups: ["admin"],
      username: "ops@example.com",
    });

    const response = await tokenCallback(
      makeNextRequest("http://localhost/api/admin/token-callback?code=demo&state=state"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.text()).resolves.toContain("desktop-handoff");
  });
});
