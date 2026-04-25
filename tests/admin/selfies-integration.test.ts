import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as listSelfies } from "@/app/api/admin/events/[eventSlug]/selfies/route";
import type { NextRequest } from "next/server";
import { resolveAdminIdentity } from "@/lib/admin/auth";
import { checkLiveE2EPrerequisites } from "../e2e/aws-test-helpers";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/auth", () => ({
  resolveAdminIdentity: vi.fn(),
  isAuthorizedAdminRequest: vi.fn(),
}));

const mockedResolveAdminIdentity = vi.mocked(resolveAdminIdentity);

function makeNextRequest(url: string, init?: RequestInit) {
  return Object.assign(new Request(url, init), {
    nextUrl: new URL(url),
  }) as unknown as NextRequest;
}

describe("Selfies & Attendees Integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists selfies from the database when authorized", async () => {
    const dbCheck = await checkLiveE2EPrerequisites({ requireDatabase: true });
    if (!dbCheck.ok) {
      console.warn(`Skipping integration test: ${dbCheck.reason}`);
      return;
    }

    mockedResolveAdminIdentity.mockResolvedValue({
      sub: "test-admin",
      tokenUse: "access",
      groups: ["admin"],
      username: "test@example.com",
    });

    // Use a known event slug or create one if we had a setup helper
    const eventSlug = "cantus-laudis-2026"; 
    
    const response = await listSelfies(
      makeNextRequest(`http://localhost/api/admin/events/${eventSlug}/selfies?page=1&pageSize=20`),
      { params: Promise.resolve({ eventSlug }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("selfies");
    expect(Array.isArray(data.selfies)).toBe(true);
  });

  it("returns 401 when identity resolution fails", async () => {
    mockedResolveAdminIdentity.mockResolvedValue(null);

    const eventSlug = "any-event";
    const response = await listSelfies(
      makeNextRequest(`http://localhost/api/admin/events/${eventSlug}/selfies`),
      { params: Promise.resolve({ eventSlug }) }
    );

    expect(response.status).toBe(401);
  });
});
