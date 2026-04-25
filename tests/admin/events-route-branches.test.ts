import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as listEvents, POST as createEvent } from "@/app/api/admin/events/route";
import { POST as presignPhotoUpload } from "@/app/api/admin/events/[eventSlug]/photos/presign/route";

vi.mock("@/lib/admin/auth", () => ({
  extractRequestId: vi.fn(() => "request-id-1"),
  isAuthorizedAdminRequest: vi.fn(),
  resolveAdminIdentity: vi.fn(),
}));

vi.mock("@/lib/admin/events/backend", () => ({
  listAdminEventsViaBackend: vi.fn(),
  createAdminEventViaBackend: vi.fn(),
  getAdminEventPhotosPageViaBackend: vi.fn(),
  createAdminEventPhotoUploadViaBackend: vi.fn(),
  getAdminReadBackendMode: vi.fn(() => "direct"),
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
  createAdminEventPhotoUpload: vi.fn(),
}));

vi.mock("@/lib/aws/database-errors", () => ({
  describeDatabaseError: vi.fn(() => ({ kind: "query", status: 500, message: "DB error" })),
  isDatabaseErrorLike: vi.fn(() => false),
}));

const mockS3Send = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  DeleteObjectCommand: class { constructor(public input: unknown) {} },
  PutObjectCommand: class { constructor(public input: unknown) {} },
  S3Client: class {
    send = mockS3Send;
  },
}));

vi.mock("@/lib/admin/events/form-utils", () => ({
  MAX_EVENT_LOGO_SIZE_BYTES: 1024 * 1024,
  parseCreateEventRequest: vi.fn(async (req) => {
    const isJson = req.headers.get("content-type")?.includes("application/json");
    if (isJson) {
      return { payload: await req.json(), logoFile: null };
    }
    return { payload: {}, logoFile: null };
  }),
  resolveEventLogoType: vi.fn((file: File) => {
    if (file.type === "image/jpeg") return { extension: "jpg", contentType: "image/jpeg" };
    return null;
  }),
}));

import { isAuthorizedAdminRequest, resolveAdminIdentity } from "@/lib/admin/auth";
import {
  createAdminEventViaBackend,
  listAdminEventsViaBackend,
  createAdminEventPhotoUploadViaBackend,
  AdminReadBackendError,
} from "@/lib/admin/events/backend";
import { parseCreateEventRequest } from "@/lib/admin/events/form-utils";

function makeNextRequest(url: string, init?: RequestInit) {
  return Object.assign(new Request(url, init), {
    nextUrl: new URL(url),
  }) as never;
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.FACE_LOCATOR_EVENT_LOGOS_BUCKET = "test-bucket";
  vi.mocked(isAuthorizedAdminRequest).mockResolvedValue(true);
  vi.mocked(resolveAdminIdentity).mockResolvedValue({ sub: "admin-1", username: "admin", tokenUse: "id", groups: ["admin"] });
});

describe("events route GET — additional branches", () => {
  it("returns events list on success", async () => {
    vi.mocked(listAdminEventsViaBackend).mockResolvedValue({ events: [], totalCount: 0, page: 1, pageSize: 30 } as never);
    const res = await listEvents(makeNextRequest("http://localhost/api/admin/events"));
    expect(res.status).toBe(200);
  });

  it("returns 503 when backend throws", async () => {
    vi.mocked(listAdminEventsViaBackend).mockRejectedValue(new Error("Lambda down"));
    const res = await listEvents(makeNextRequest("http://localhost/api/admin/events"));
    expect(res.status).toBe(503);
  });

  it("returns backend error status for AdminReadBackendError", async () => {
    vi.mocked(listAdminEventsViaBackend).mockRejectedValue(new AdminReadBackendError("Lambda error", 502));
    const res = await listEvents(makeNextRequest("http://localhost/api/admin/events"));
    expect(res.status).toBe(502);
  });
});

describe("events route POST — branches", () => {
  it("returns 401 when unauthorized", async () => {
    vi.mocked(isAuthorizedAdminRequest).mockResolvedValue(false);
    const res = await createEvent(makeNextRequest("http://localhost/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", slug: "test" }),
    }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid payload", async () => {
    const res = await createEvent(makeNextRequest("http://localhost/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", slug: "" }),
    }));
    expect(res.status).toBe(400);
  });

  it("returns 201 on success with JSON body", async () => {
    vi.mocked(createAdminEventViaBackend).mockResolvedValue({ id: "e1", slug: "my-event" } as never);
    const res = await createEvent(makeNextRequest("http://localhost/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "My Event",
        slug: "my-event",
        venue: "Venue",
        description: "Description",
        startsAt: "2026-01-01T10:00:00.000Z",
        endsAt: "2026-01-02T10:00:00.000Z",
      }),
    }));
    expect(res.status).toBe(201);
  });

  it("returns 409 for duplicate slug (DB unique violation)", async () => {
    vi.mocked(createAdminEventViaBackend).mockRejectedValue(
      Object.assign(new Error("unique_violation"), { code: "23505" }),
    );
    const res = await createEvent(makeNextRequest("http://localhost/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "My Event",
        slug: "my-event",
        venue: "Venue",
        description: "Description",
        startsAt: "2026-01-01T10:00:00.000Z",
        endsAt: "2026-01-02T10:00:00.000Z",
      }),
    }));
    expect(res.status).toBe(409);
  });

  it("returns 409 for duplicate slug (backend 409 error)", async () => {
    const error = new AdminReadBackendError("Duplicate", 409);
    vi.mocked(createAdminEventViaBackend).mockRejectedValue(error);
    const res = await createEvent(makeNextRequest("http://localhost/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "My Event",
        slug: "my-event",
        venue: "Venue",
        description: "Description",
        startsAt: "2026-01-01T10:00:00.000Z",
        endsAt: "2026-01-02T10:00:00.000Z",
      }),
    }));
    expect(res.status).toBe(409);
  });

  it("returns 500 on generic backend error", async () => {
    vi.mocked(createAdminEventViaBackend).mockRejectedValue(new Error("DB crash"));
    const res = await createEvent(makeNextRequest("http://localhost/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "My Event",
        slug: "my-event",
        venue: "Venue",
        description: "Description",
        startsAt: "2026-01-01T10:00:00.000Z",
        endsAt: "2026-01-02T10:00:00.000Z",
      }),
    }));
    expect(res.status).toBe(500);
  });

  it("returns 400 when logo upload fails", async () => {
    vi.mocked(parseCreateEventRequest).mockResolvedValue({
      payload: {
        title: "My Event",
        slug: "my-event",
        venue: "Venue",
        description: "Description",
        startsAt: "2026-01-01T10:00:00.000Z",
        endsAt: "2026-01-02T10:00:00.000Z",
      },
      logoFile: new File(["data"], "logo.jpg", { type: "image/jpeg" }),
    });

    mockS3Send.mockRejectedValue(new Error("S3 Upload Failed"));

    const res = await createEvent(makeNextRequest("http://localhost/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data" },
    }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("S3 Upload Failed");
  });

  it("cleans up logo on backend failure", async () => {
    vi.mocked(parseCreateEventRequest).mockResolvedValue({
      payload: {
        title: "My Event",
        slug: "my-event",
        venue: "Venue",
        description: "Description",
        startsAt: "2026-01-01T10:00:00.000Z",
        endsAt: "2026-01-02T10:00:00.000Z",
      },
      logoFile: new File(["data"], "logo.jpg", { type: "image/jpeg" }),
    });

    mockS3Send.mockResolvedValue({}); // Success for upload
    vi.mocked(createAdminEventViaBackend).mockRejectedValue(new Error("DB Error"));

    const res = await createEvent(makeNextRequest("http://localhost/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data" },
    }));

    expect(res.status).toBe(500);
    // Should have called S3 twice: once for upload (PutObjectCommand), once for cleanup (DeleteObjectCommand)
    expect(mockS3Send).toHaveBeenCalledTimes(2);
  });
});

describe("presign route — additional branches", () => {
  it("returns 401 when not authorized", async () => {
    vi.mocked(resolveAdminIdentity).mockResolvedValue(null);
    const res = await presignPhotoUpload(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: "image/jpeg" }),
      }),
      { params: Promise.resolve({ eventSlug: "demo" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    const res = await presignPhotoUpload(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ eventSlug: "demo" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 on success (direct mode)", async () => {
    vi.mocked(createAdminEventPhotoUploadViaBackend).mockResolvedValue({
      event: { id: "e1", slug: "demo" },
      photo: { photoId: "p1", objectKey: "key", uploadedBy: "admin-1" },
      upload: { method: "PUT", url: "https://s3/upload", headers: {}, objectKey: "key", expiresAt: "2026-01-01T10:00:00Z" },
    });
    const res = await presignPhotoUpload(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: "image/jpeg" }),
      }),
      { params: Promise.resolve({ eventSlug: "demo" }) },
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when event not found", async () => {
    vi.mocked(createAdminEventPhotoUploadViaBackend).mockResolvedValue(null);
    const res = await presignPhotoUpload(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: "image/jpeg" }),
      }),
      { params: Promise.resolve({ eventSlug: "demo" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 500 on error", async () => {
    vi.mocked(createAdminEventPhotoUploadViaBackend).mockRejectedValue(new Error("DB error"));
    const res = await presignPhotoUpload(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: "image/jpeg" }),
      }),
      { params: Promise.resolve({ eventSlug: "demo" }) },
    );
    expect(res.status).toBe(500);
  });
});
