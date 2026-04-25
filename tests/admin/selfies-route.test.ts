import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/auth", () => ({
  isAuthorizedAdminRequest: vi.fn(),
  resolveAdminIdentity: vi.fn(),
  extractRequestId: vi.fn(() => null),
}));

vi.mock("@/lib/admin/events/backend", () => ({
  getAdminEventSelfiesPageViaBackend: vi.fn(),
  getAdminReadBackendMode: vi.fn(() => "direct"),
  AdminReadBackendError: class AdminReadBackendError extends Error {
    public readonly statusCode: number;
    public readonly details: unknown;
    constructor(message: string, statusCode: number, details: unknown) {
      super(message);
      this.name = "AdminReadBackendError";
      this.statusCode = statusCode;
      this.details = details;
    }
  },
}));

vi.mock("@/lib/admin/events/repository", () => ({
  deleteAdminEventAttendee: vi.fn(),
}));

vi.mock("@/lib/aws/database-errors", () => ({
  isDatabaseErrorLike: vi.fn(() => false),
  describeDatabaseError: vi.fn(),
}));

import { isAuthorizedAdminRequest, resolveAdminIdentity } from "@/lib/admin/auth";
import { getAdminEventSelfiesPageViaBackend } from "@/lib/admin/events/backend";
import { deleteAdminEventAttendee } from "@/lib/admin/events/repository";
import { GET as getSelfies } from "@/app/api/admin/events/[eventSlug]/selfies/route";
import { DELETE as deleteSelfie } from "@/app/api/admin/events/[eventSlug]/selfies/[registrationId]/route";

const mockedIsAuthorized = vi.mocked(isAuthorizedAdminRequest);
const mockedResolveIdentity = vi.mocked(resolveAdminIdentity);
const mockedGetSelfiesPage = vi.mocked(getAdminEventSelfiesPageViaBackend);
const mockedDeleteAttendee = vi.mocked(deleteAdminEventAttendee);

function makeRequest(url: string, init?: RequestInit) {
  return Object.assign(new Request(url, init), { nextUrl: new URL(url) }) as never;
}

describe("GET /api/admin/events/[eventSlug]/selfies", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 401 when unauthorized", async () => {
    mockedIsAuthorized.mockResolvedValue(false);
    const res = await getSelfies(makeRequest("http://localhost/api/admin/events/demo/selfies"), {
      params: Promise.resolve({ eventSlug: "demo" }),
    });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockedGetSelfiesPage).not.toHaveBeenCalled();
  });

  it("returns selfies page when authorized", async () => {
    mockedIsAuthorized.mockResolvedValue(true);
    const page = {
      event: { id: "e1", slug: "demo", title: "Demo", venue: "V", description: "D", startsAt: "2026-01-01T10:00:00Z", endsAt: "2026-01-02T10:00:00Z" },
      selfies: [],
      page: 1,
      pageSize: 30,
      totalCount: 0,
    };
    mockedGetSelfiesPage.mockResolvedValue(page);

    const res = await getSelfies(makeRequest("http://localhost/api/admin/events/demo/selfies?page=1&pageSize=30"), {
      params: Promise.resolve({ eventSlug: "demo" }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ selfies: [], totalCount: 0 });
  });
});

describe("DELETE /api/admin/events/[eventSlug]/selfies/[registrationId]", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 401 when identity is missing", async () => {
    mockedResolveIdentity.mockResolvedValue(null);
    const res = await deleteSelfie(
      makeRequest("http://localhost/api/admin/events/demo/selfies/reg1", { method: "DELETE" }) as never,
      { params: Promise.resolve({ eventSlug: "demo", registrationId: "reg1" }) },
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockedDeleteAttendee).not.toHaveBeenCalled();
  });

  it("returns 200 on successful delete", async () => {
    mockedResolveIdentity.mockResolvedValue({ sub: "admin-1", tokenUse: "access", groups: ["admin"], username: null });
    mockedDeleteAttendee.mockResolvedValue({ registrationId: "reg1", status: "deleted" });

    const res = await deleteSelfie(
      makeRequest("http://localhost/api/admin/events/demo/selfies/reg1", { method: "DELETE" }) as never,
      { params: Promise.resolve({ eventSlug: "demo", registrationId: "reg1" }) },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ registrationId: "reg1", status: "deleted" });
    expect(mockedDeleteAttendee).toHaveBeenCalledWith({
      eventSlug: "demo",
      registrationId: "reg1",
      actorSub: "admin-1",
    });
  });

  it("returns 200 with not_found status", async () => {
    mockedResolveIdentity.mockResolvedValue({ sub: "admin-1", tokenUse: "access", groups: ["admin"], username: null });
    mockedDeleteAttendee.mockResolvedValue({ registrationId: "reg1", status: "not_found" });

    const res = await deleteSelfie(
      makeRequest("http://localhost/api/admin/events/demo/selfies/reg1", { method: "DELETE" }) as never,
      { params: Promise.resolve({ eventSlug: "demo", registrationId: "reg1" }) },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "not_found" });
  });

  it("returns 500 when status is failed", async () => {
    mockedResolveIdentity.mockResolvedValue({ sub: "admin-1", tokenUse: "access", groups: ["admin"], username: null });
    mockedDeleteAttendee.mockResolvedValue({ registrationId: "reg1", status: "failed", message: "S3 error" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await deleteSelfie(
      makeRequest("http://localhost/api/admin/events/demo/selfies/reg1", { method: "DELETE" }) as never,
      { params: Promise.resolve({ eventSlug: "demo", registrationId: "reg1" }) },
    );
    expect(res.status).toBe(500);
  });
});
