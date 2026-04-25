import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mock factories ───────────────────────────────────────────────────
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("@aws-sdk/client-lambda", () => ({
  InvokeCommand: class {
    constructor(public readonly input: unknown) {}
  },
  LambdaClient: class {
    constructor(public readonly config: unknown) {}
    send = sendMock;
  },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  CopyObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
  HeadObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
  S3Client: class {
    constructor(public readonly config: unknown) {}
    send = sendMock;
  },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed.example.com/photo"),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin/events/repository", () => ({
  listAdminEvents: vi.fn(),
}));

vi.mock("@/lib/aws/database", () => ({
  getDatabasePool: vi.fn(),
}));

vi.mock("@/lib/aws/boundary", () => ({
  buildEventPhotoPendingObjectKey: vi.fn(
    (input: { eventId: string; photoId: string; extension: string }) =>
      `events/pending/${input.eventId}/photos/${input.photoId}.${input.extension}`,
  ),
}));

import { listAdminEvents } from "@/lib/admin/events/repository";
import { getDatabasePool } from "@/lib/aws/database";

const mockedListAdminEvents = vi.mocked(listAdminEvents);
const mockedGetDatabasePool = vi.mocked(getDatabasePool);

function encodePayload(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8");
}

describe("admin backend — env resolution", () => {
  afterEach(() => {
    delete process.env.ADMIN_READ_BACKEND;
    delete process.env.FACE_LOCATOR_ADMIN_READ_BACKEND;
    delete process.env.FACE_LOCATOR_ADMIN_EVENTS_READ_LAMBDA_NAME;
    delete process.env.ADMIN_EVENTS_READ_LAMBDA_NAME;
    delete process.env.FACE_LOCATOR_MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME;
    delete process.env.MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME;
  });

  it("returns direct mode by default", async () => {
    const { getAdminReadBackendMode } = await import("@/lib/admin/events/backend");
    expect(getAdminReadBackendMode()).toBe("direct");
  });

  it("returns lambda mode when ADMIN_READ_BACKEND=lambda", async () => {
    process.env.ADMIN_READ_BACKEND = "lambda";
    const { getAdminReadBackendMode } = await import("@/lib/admin/events/backend");
    expect(getAdminReadBackendMode()).toBe("lambda");
  });

  it("falls back to default lambda name", async () => {
    const { getAdminEventsReadLambdaName } = await import("@/lib/admin/events/backend");
    expect(getAdminEventsReadLambdaName()).toBe("face-locator-poc-admin-events-read");
  });

  it("reads FACE_LOCATOR_ADMIN_EVENTS_READ_LAMBDA_NAME env", async () => {
    process.env.FACE_LOCATOR_ADMIN_EVENTS_READ_LAMBDA_NAME = "my-custom-lambda";
    const { getAdminEventsReadLambdaName } = await import("@/lib/admin/events/backend");
    expect(getAdminEventsReadLambdaName()).toBe("my-custom-lambda");
  });

  it("falls back to default matched photo notifier name", async () => {
    const { getMatchedPhotoNotifierLambdaName } = await import("@/lib/admin/events/backend");
    expect(getMatchedPhotoNotifierLambdaName()).toBe("face-locator-poc-matched-photo-notifier");
  });

  it("reads FACE_LOCATOR_MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME env", async () => {
    process.env.FACE_LOCATOR_MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME = "my-notifier";
    const { getMatchedPhotoNotifierLambdaName } = await import("@/lib/admin/events/backend");
    expect(getMatchedPhotoNotifierLambdaName()).toBe("my-notifier");
  });
});

describe("AdminReadBackendError", () => {
  it("carries statusCode and details", async () => {
    const { AdminReadBackendError } = await import("@/lib/admin/events/backend");
    const err = new AdminReadBackendError("something failed", 502, {
      operation: "listAdminEvents",
      backend: "lambda",
      lambdaName: "my-lambda",
    });
    expect(err.name).toBe("AdminReadBackendError");
    expect(err.statusCode).toBe(502);
    expect(err.details.operation).toBe("listAdminEvents");
    expect(err.message).toBe("something failed");
  });
});

describe("listAdminEventsViaBackend — direct mode", () => {
  beforeEach(() => {
    delete process.env.ADMIN_READ_BACKEND;
    sendMock.mockReset();
    mockedListAdminEvents.mockReset();
  });

  it("delegates to repository in direct mode", async () => {
    mockedListAdminEvents.mockResolvedValue({ events: [], totalCount: 0 });
    const { listAdminEventsViaBackend } = await import("@/lib/admin/events/backend");
    const result = await listAdminEventsViaBackend({ page: 1, pageSize: 30 });
    expect(result).toEqual({ events: [], totalCount: 0 });
    expect(mockedListAdminEvents).toHaveBeenCalledWith({ page: 1, pageSize: 30 });
  });
});

describe("listAdminEventsViaBackend — lambda mode", () => {
  beforeEach(() => {
    process.env.ADMIN_READ_BACKEND = "lambda";
    process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET = "my-photos-bucket";
    sendMock.mockReset();
    mockedListAdminEvents.mockReset();
  });

  afterEach(() => {
    delete process.env.ADMIN_READ_BACKEND;
    delete process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET;
  });

  it("invokes lambda and returns payload", async () => {
    const payload = { events: [{ id: "e1" }], totalCount: 1 };
    sendMock.mockResolvedValue({ Payload: encodePayload(payload) });

    const { listAdminEventsViaBackend } = await import("@/lib/admin/events/backend");
    const result = await listAdminEventsViaBackend({ page: 1, pageSize: 30 });
    expect(result).toEqual(payload);
  });

  it("throws AdminReadBackendError on empty payload", async () => {
    sendMock.mockResolvedValue({ Payload: null });

    const { AdminReadBackendError, listAdminEventsViaBackend } = await import("@/lib/admin/events/backend");
    await expect(listAdminEventsViaBackend({ page: 1, pageSize: 30 })).rejects.toBeInstanceOf(
      AdminReadBackendError,
    );
  });

  it("throws AdminReadBackendError when lambda payload has statusCode shape", async () => {
    const errorPayload = { statusCode: 503, errorMessage: "Lambda failed" };
    sendMock.mockResolvedValue({ Payload: encodePayload(errorPayload) });

    const { AdminReadBackendError, listAdminEventsViaBackend } = await import("@/lib/admin/events/backend");
    await expect(listAdminEventsViaBackend({ page: 1, pageSize: 30 })).rejects.toBeInstanceOf(
      AdminReadBackendError,
    );
  });

  it("wraps network errors in AdminReadBackendError", async () => {
    sendMock.mockRejectedValue(new Error("Network error"));

    const { AdminReadBackendError, listAdminEventsViaBackend } = await import("@/lib/admin/events/backend");
    const err = await listAdminEventsViaBackend({ page: 1, pageSize: 30 }).catch((e) => e);
    expect(err).toBeInstanceOf(AdminReadBackendError);
    expect((err as InstanceType<typeof AdminReadBackendError>).statusCode).toBe(503);
  });
});

describe("getAdminEventPhotosPageViaBackend — lambda mode faceMatchSummary normalization", () => {
  beforeEach(() => {
    process.env.ADMIN_READ_BACKEND = "lambda";
    process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET = "my-photos-bucket";
    sendMock.mockReset();
  });

  afterEach(() => {
    delete process.env.ADMIN_READ_BACKEND;
    delete process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET;
  });

  it("normalizes matchedFaces from lambda payload", async () => {
    const payload = {
      event: { id: "e1", slug: "demo", title: "Demo", venue: "Venue", description: "", startsAt: "2026-01-01T10:00:00Z", endsAt: "2026-01-02T10:00:00Z" },
      photos: [],
      faceMatchSummary: {
        totalMatchedFaces: 1,
        totalRegisteredSelfies: 5,
        totalAssociatedUsers: 3,
        matchedFaces: [
          {
            attendeeId: "a1",
            attendeeName: "Alice",
            attendeeEmail: "alice@example.com",
            faceEnrollmentId: "fe1",
            faceId: "face1",
            matchedPhotoCount: 2,
            lastMatchedAt: "2026-01-01T12:00:00Z",
          },
        ],
      },
      page: 1,
      pageSize: 30,
      totalCount: 0,
    };
    sendMock.mockResolvedValue({ Payload: encodePayload(payload) });

    const { getAdminEventPhotosPageViaBackend } = await import("@/lib/admin/events/backend");
    const result = await getAdminEventPhotosPageViaBackend({ eventSlug: "demo", page: 1, pageSize: 30 });

    expect(result.faceMatchSummary.totalMatchedFaces).toBe(1);
    expect(result.faceMatchSummary.matchedFaces).toHaveLength(1);
    expect(result.faceMatchSummary.matchedFaces[0]?.attendeeName).toBe("Alice");
  });

  it("falls back gracefully when faceMatchSummary is missing", async () => {
    const payload = {
      event: null,
      photos: [],
      page: 1,
      pageSize: 30,
      totalCount: 0,
    };
    sendMock.mockResolvedValue({ Payload: encodePayload(payload) });

    const { getAdminEventPhotosPageViaBackend } = await import("@/lib/admin/events/backend");
    const result = await getAdminEventPhotosPageViaBackend({ eventSlug: "demo", page: 1, pageSize: 30 });

    expect(result.faceMatchSummary.totalMatchedFaces).toBe(0);
    expect(result.faceMatchSummary.matchedFaces).toHaveLength(0);
  });
});

describe("reprocessAdminEventPhotosViaBackend — lambda mode", () => {
  beforeEach(() => {
    process.env.ADMIN_READ_BACKEND = "lambda";
    sendMock.mockReset();
  });

  afterEach(() => {
    delete process.env.ADMIN_READ_BACKEND;
  });

  it("delegates to lambda and returns summary", async () => {
    const payload = { eventSlug: "demo", total: 5, queued: 4, failed: 1 };
    sendMock.mockResolvedValue({ Payload: encodePayload(payload) });

    const { reprocessAdminEventPhotosViaBackend } = await import("@/lib/admin/events/backend");
    const result = await reprocessAdminEventPhotosViaBackend({ eventSlug: "demo" });
    expect(result).toEqual(payload);
  });
});

describe("reprocessAdminEventPhotosViaBackend — direct mode", () => {
  beforeEach(() => {
    delete process.env.ADMIN_READ_BACKEND;
    process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET = "my-photos-bucket";
    sendMock.mockReset();
    mockedGetDatabasePool.mockReset();
  });

  afterEach(() => {
    delete process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET;
  });

  it("returns null when event is not found", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    mockedGetDatabasePool.mockResolvedValue(mockPool as never);

    const { reprocessAdminEventPhotosViaBackend } = await import("@/lib/admin/events/backend");
    const result = await reprocessAdminEventPhotosViaBackend({ eventSlug: "missing" });
    expect(result).toBeNull();
  });

  it("queues S3 copies and returns summary", async () => {
    const queryMock = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] })       // event lookup
      .mockResolvedValueOnce({ rows: [{ id: "p1", objectKey: "events/other/p1.jpg" }] }); // photos
    mockedGetDatabasePool.mockResolvedValue({ query: queryMock } as never);
    sendMock.mockResolvedValue({});  // S3 CopyObjectCommand succeeds

    const { reprocessAdminEventPhotosViaBackend } = await import("@/lib/admin/events/backend");
    const result = await reprocessAdminEventPhotosViaBackend({ eventSlug: "demo" });
    expect(result).toMatchObject({ eventSlug: "demo", total: 1, queued: 1, failed: 0 });
  });

  it("records failed count when S3 copy throws", async () => {
    const queryMock = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "p1", objectKey: "events/other/p1.jpg" }] });
    mockedGetDatabasePool.mockResolvedValue({ query: queryMock } as never);
    sendMock.mockRejectedValue(new Error("S3 error"));

    const { reprocessAdminEventPhotosViaBackend } = await import("@/lib/admin/events/backend");
    const result = await reprocessAdminEventPhotosViaBackend({ eventSlug: "demo" });
    expect(result).toMatchObject({ total: 1, queued: 0, failed: 1 });
  });
});

describe("sendMatchedPhotoNotificationViaBackend", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("returns the notification summary on success", async () => {
    const responsePayload = { scanned: 1, sent: 1, skipped: 0, failed: 0 };
    sendMock.mockResolvedValue({ Payload: encodePayload(responsePayload) });

    const { sendMatchedPhotoNotificationViaBackend } = await import("@/lib/admin/events/backend");
    const result = await sendMatchedPhotoNotificationViaBackend({
      eventSlug: "demo",
      attendeeId: "a1",
    });
    expect(result).toEqual(responsePayload);
  });

  it("throws AdminReadBackendError on empty payload", async () => {
    sendMock.mockResolvedValue({ Payload: null });

    const { AdminReadBackendError, sendMatchedPhotoNotificationViaBackend } = await import(
      "@/lib/admin/events/backend"
    );
    await expect(
      sendMatchedPhotoNotificationViaBackend({ eventSlug: "demo", attendeeId: "a1" }),
    ).rejects.toBeInstanceOf(AdminReadBackendError);
  });

  it("throws AdminReadBackendError when lambda returns error shape", async () => {
    sendMock.mockResolvedValue({
      Payload: encodePayload({ statusCode: 500, errorMessage: "Lambda crashed" }),
    });

    const { AdminReadBackendError, sendMatchedPhotoNotificationViaBackend } = await import(
      "@/lib/admin/events/backend"
    );
    await expect(
      sendMatchedPhotoNotificationViaBackend({ eventSlug: "demo", attendeeId: "a1" }),
    ).rejects.toBeInstanceOf(AdminReadBackendError);
  });

  it("wraps network errors in AdminReadBackendError with 503", async () => {
    sendMock.mockRejectedValue(new Error("connection refused"));

    const { AdminReadBackendError, sendMatchedPhotoNotificationViaBackend } = await import(
      "@/lib/admin/events/backend"
    );
    const err = await sendMatchedPhotoNotificationViaBackend({ eventSlug: "demo", attendeeId: "a1" }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(AdminReadBackendError);
    expect((err as InstanceType<typeof AdminReadBackendError>).statusCode).toBe(503);
  });
});
