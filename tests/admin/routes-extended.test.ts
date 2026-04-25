import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as listEventPhotos } from "@/app/api/admin/events/[eventSlug]/photos/route";
import { GET as listEventSelfies } from "@/app/api/admin/events/[eventSlug]/selfies/route";
import { DELETE as deleteAttendee } from "@/app/api/admin/events/[eventSlug]/selfies/[registrationId]/route";
import { POST as reprocessPhotos } from "@/app/api/admin/events/[eventSlug]/photos/reprocess/route";
import { POST as notifyPhotoMatch } from "@/app/api/admin/events/[eventSlug]/photos/notify/route";
import { DELETE as deleteSinglePhoto } from "@/app/api/admin/events/[eventSlug]/photos/[photoId]/route";

vi.mock("@/lib/admin/auth", () => ({
  extractRequestId: vi.fn(() => "request-id-1"),
  isAuthorizedAdminRequest: vi.fn(),
  resolveAdminIdentity: vi.fn(),
}));

vi.mock("@/lib/admin/events/backend", () => ({
  getAdminEventPhotosPageViaBackend: vi.fn(),
  getAdminEventSelfiesPageViaBackend: vi.fn(),
  getAdminReadBackendMode: vi.fn(() => "direct"),
  reprocessAdminEventPhotosViaBackend: vi.fn(),
  sendMatchedPhotoNotificationViaBackend: vi.fn(),
  AdminReadBackendError: class extends Error {
    statusCode: number;
    details: Record<string, unknown>;
    constructor(message: string, statusCode: number, details?: Record<string, unknown>) {
      super(message);
      this.statusCode = statusCode;
      this.details = details ?? {};
    }
  },
}));

vi.mock("@/lib/admin/events/repository", () => ({
  deleteAdminEventPhoto: vi.fn(),
  listAdminEventSelfies: vi.fn(),
  deleteAdminEventAttendee: vi.fn(),
}));

vi.mock("@/lib/aws/database-errors", () => ({
  describeDatabaseError: vi.fn(() => ({ kind: "query", status: 500, message: "DB error" })),
  isDatabaseErrorLike: vi.fn(() => false),
}));

import { isAuthorizedAdminRequest, resolveAdminIdentity } from "@/lib/admin/auth";
import {
  getAdminEventPhotosPageViaBackend,
  getAdminEventSelfiesPageViaBackend,
  reprocessAdminEventPhotosViaBackend,
  sendMatchedPhotoNotificationViaBackend,
} from "@/lib/admin/events/backend";
import {
  deleteAdminEventPhoto,
  deleteAdminEventAttendee,
} from "@/lib/admin/events/repository";

function makeRequestWithUrl(url: string, options?: RequestInit) {
  const req = new Request(`http://localhost:3000${url}`, options) as unknown as import("next/server").NextRequest;
  Object.defineProperty(req, "nextUrl", {
    get: () => new URL(`http://localhost:3000${url}`),
  });
  return req;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isAuthorizedAdminRequest).mockResolvedValue(true);
  vi.mocked(resolveAdminIdentity).mockResolvedValue({ sub: "admin-1", username: "admin", tokenUse: "id", groups: ["admin"] });
});

// --- Photos route (uses isAuthorizedAdminRequest) ---

describe("admin photos route — branches", () => {
  it("returns 401 when not authorized", async () => {
    vi.mocked(isAuthorizedAdminRequest).mockResolvedValue(false);
    const req = makeRequestWithUrl("/api/admin/events/demo/photos");
    const res = await listEventPhotos(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid pagination", async () => {
    const req = makeRequestWithUrl("/api/admin/events/demo/photos?page=abc");
    // parsePaginationQuery always succeeds (coerces to defaults), so this path
    // triggers the backend which we haven't mocked — leading to an error response.
    vi.mocked(getAdminEventPhotosPageViaBackend).mockRejectedValue(new Error("mock"));
    const res = await listEventPhotos(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(503);
  });

  it("returns 404 when event not found", async () => {
    vi.mocked(getAdminEventPhotosPageViaBackend).mockResolvedValue({
      event: null, photos: [], faceMatchSummary: { totalMatchedFaces: 0, totalRegisteredSelfies: 0, totalAssociatedUsers: 0, matchedFaces: [] },
      page: 1, pageSize: 20, totalCount: 0,
    } as never);
    const req = makeRequestWithUrl("/api/admin/events/demo/photos");
    const res = await listEventPhotos(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 on success", async () => {
    vi.mocked(getAdminEventPhotosPageViaBackend).mockResolvedValue({
      event: { id: "e1", slug: "demo", title: "Demo" }, photos: [],
      faceMatchSummary: { totalMatchedFaces: 0, totalRegisteredSelfies: 0, totalAssociatedUsers: 0, matchedFaces: [] },
      page: 1, pageSize: 20, totalCount: 0,
    } as never);
    const req = makeRequestWithUrl("/api/admin/events/demo/photos");
    const res = await listEventPhotos(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(200);
  });

  it("returns 503 on error", async () => {
    vi.mocked(getAdminEventPhotosPageViaBackend).mockRejectedValue(new Error("fail"));
    const req = makeRequestWithUrl("/api/admin/events/demo/photos");
    const res = await listEventPhotos(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(503);
  });
});

// --- Single photo delete (uses resolveAdminIdentity) ---

describe("admin single photo delete — branches", () => {
  it("returns 401 when not authorized", async () => {
    vi.mocked(resolveAdminIdentity).mockResolvedValue(null);
    const req = makeRequestWithUrl("/api/admin/events/demo/photos/p1");
    const res = await deleteSinglePhoto(req, { params: Promise.resolve({ eventSlug: "demo", photoId: "p1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 200 on deleted", async () => {
    vi.mocked(deleteAdminEventPhoto).mockResolvedValue({ photoId: "p1", status: "deleted" });
    const req = makeRequestWithUrl("/api/admin/events/demo/photos/p1");
    const res = await deleteSinglePhoto(req, { params: Promise.resolve({ eventSlug: "demo", photoId: "p1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 500 on failed status", async () => {
    vi.mocked(deleteAdminEventPhoto).mockResolvedValue({ photoId: "p1", status: "failed", message: "S3 denied" });
    const req = makeRequestWithUrl("/api/admin/events/demo/photos/p1");
    const res = await deleteSinglePhoto(req, { params: Promise.resolve({ eventSlug: "demo", photoId: "p1" }) });
    expect(res.status).toBe(500);
  });

  it("returns 500 on error", async () => {
    vi.mocked(deleteAdminEventPhoto).mockRejectedValue(new Error("DB down"));
    const req = makeRequestWithUrl("/api/admin/events/demo/photos/p1");
    const res = await deleteSinglePhoto(req, { params: Promise.resolve({ eventSlug: "demo", photoId: "p1" }) });
    expect(res.status).toBe(500);
  });
});

// --- Reprocess (uses resolveAdminIdentity) ---

describe("admin reprocess photos — branches", () => {
  it("returns 401 when not authorized", async () => {
    vi.mocked(resolveAdminIdentity).mockResolvedValue(null);
    const req = makeRequestWithUrl("/api/admin/events/demo/photos/reprocess", { method: "POST" });
    const res = await reprocessPhotos(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(401);
  });

  it("returns 200 on success", async () => {
    vi.mocked(reprocessAdminEventPhotosViaBackend).mockResolvedValue({ queued: 3, failed: 0, skipped: 0, total: 3 } as never);
    const req = makeRequestWithUrl("/api/admin/events/demo/photos/reprocess", { method: "POST" });
    const res = await reprocessPhotos(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(200);
  });

  it("returns 404 when event not found", async () => {
    vi.mocked(reprocessAdminEventPhotosViaBackend).mockResolvedValue(null as never);
    const req = makeRequestWithUrl("/api/admin/events/demo/photos/reprocess", { method: "POST" });
    const res = await reprocessPhotos(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(404);
  });

  it("returns 500 on error", async () => {
    vi.mocked(reprocessAdminEventPhotosViaBackend).mockRejectedValue(new Error("fail"));
    const req = makeRequestWithUrl("/api/admin/events/demo/photos/reprocess", { method: "POST" });
    const res = await reprocessPhotos(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(500);
  });
});

// --- Notify (uses resolveAdminIdentity) ---

describe("admin notify photo match — branches", () => {
  it("returns 401 when not authorized", async () => {
    vi.mocked(resolveAdminIdentity).mockResolvedValue(null);
    const req = makeRequestWithUrl("/api/admin/events/demo/photos/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendeeId: "a1" }),
    });
    const res = await notifyPhotoMatch(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when attendeeId missing", async () => {
    const req = makeRequestWithUrl("/api/admin/events/demo/photos/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await notifyPhotoMatch(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful notification", async () => {
    vi.mocked(sendMatchedPhotoNotificationViaBackend).mockResolvedValue({ sent: 1, failed: 0, scanned: 1 } as never);
    const req = makeRequestWithUrl("/api/admin/events/demo/photos/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendeeId: "a1" }),
    });
    const res = await notifyPhotoMatch(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(200);
  });

  it("returns 404 when no candidate found", async () => {
    vi.mocked(sendMatchedPhotoNotificationViaBackend).mockResolvedValue({ sent: 0, failed: 0, scanned: 0 } as never);
    const req = makeRequestWithUrl("/api/admin/events/demo/photos/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendeeId: "a1" }),
    });
    const res = await notifyPhotoMatch(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(404);
  });

  it("returns 500 when all notifications fail", async () => {
    vi.mocked(sendMatchedPhotoNotificationViaBackend).mockResolvedValue({ sent: 0, failed: 1, scanned: 1 } as never);
    const req = makeRequestWithUrl("/api/admin/events/demo/photos/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendeeId: "a1" }),
    });
    const res = await notifyPhotoMatch(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(500);
  });

  it("returns 409 when notification could not be sent", async () => {
    vi.mocked(sendMatchedPhotoNotificationViaBackend).mockResolvedValue({ sent: 0, failed: 0, scanned: 1 } as never);
    const req = makeRequestWithUrl("/api/admin/events/demo/photos/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendeeId: "a1" }),
    });
    const res = await notifyPhotoMatch(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(409);
  });

  it("returns 500 on backend error", async () => {
    vi.mocked(sendMatchedPhotoNotificationViaBackend).mockRejectedValue(new Error("SES fail"));
    const req = makeRequestWithUrl("/api/admin/events/demo/photos/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendeeId: "a1" }),
    });
    const res = await notifyPhotoMatch(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(500);
  });
});

// --- Selfies route (uses isAuthorizedAdminRequest) ---

describe("admin selfies route — branches", () => {
  it("returns 401 when not authorized", async () => {
    vi.mocked(isAuthorizedAdminRequest).mockResolvedValue(false);
    const req = makeRequestWithUrl("/api/admin/events/demo/selfies");
    const res = await listEventSelfies(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(401);
  });

  it("returns 200 on success", async () => {
    vi.mocked(getAdminEventSelfiesPageViaBackend).mockResolvedValue({
      event: { id: "e1", slug: "demo" }, selfies: [], page: 1, pageSize: 20, totalCount: 0,
    } as never);
    const req = makeRequestWithUrl("/api/admin/events/demo/selfies");
    const res = await listEventSelfies(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(200);
  });

  it("returns 503 on error", async () => {
    vi.mocked(getAdminEventSelfiesPageViaBackend).mockRejectedValue(new Error("DB crashed"));
    const req = makeRequestWithUrl("/api/admin/events/demo/selfies");
    const res = await listEventSelfies(req, { params: Promise.resolve({ eventSlug: "demo" }) });
    expect(res.status).toBe(503);
  });
});

// --- Attendee delete (uses resolveAdminIdentity) ---

describe("admin attendee delete route — branches", () => {
  it("returns 401 when not authorized", async () => {
    vi.mocked(resolveAdminIdentity).mockResolvedValue(null);
    const req = makeRequestWithUrl("/api/admin/events/demo/selfies/r1", { method: "DELETE" });
    const res = await deleteAttendee(req, { params: Promise.resolve({ eventSlug: "demo", registrationId: "r1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 200 on deleted", async () => {
    vi.mocked(deleteAdminEventAttendee).mockResolvedValue({ registrationId: "r1", status: "deleted" });
    const req = makeRequestWithUrl("/api/admin/events/demo/selfies/r1", { method: "DELETE" });
    const res = await deleteAttendee(req, { params: Promise.resolve({ eventSlug: "demo", registrationId: "r1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 500 on failed status", async () => {
    vi.mocked(deleteAdminEventAttendee).mockResolvedValue({ registrationId: "r1", status: "failed", message: "S3 error" });
    const req = makeRequestWithUrl("/api/admin/events/demo/selfies/r1", { method: "DELETE" });
    const res = await deleteAttendee(req, { params: Promise.resolve({ eventSlug: "demo", registrationId: "r1" }) });
    expect(res.status).toBe(500);
  });

  it("returns 500 on error", async () => {
    vi.mocked(deleteAdminEventAttendee).mockRejectedValue(new Error("S3 error"));
    const req = makeRequestWithUrl("/api/admin/events/demo/selfies/r1", { method: "DELETE" });
    const res = await deleteAttendee(req, { params: Promise.resolve({ eventSlug: "demo", registrationId: "r1" }) });
    expect(res.status).toBe(500);
  });
});
