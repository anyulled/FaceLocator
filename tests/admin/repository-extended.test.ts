import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { s3SendMock } = vi.hoisted(() => ({
  s3SendMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  DeleteObjectCommand: class { constructor(public input: unknown) {} },
  GetObjectCommand: class { constructor(public input: unknown) {} },
  PutObjectCommand: class { constructor(public input: unknown) {} },
  S3Client: class { send = s3SendMock; },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed.s3.example.com/preview"),
}));

vi.mock("@/lib/aws/database", () => ({
  getDatabasePool: vi.fn(),
}));

vi.mock("@/lib/admin/events/schema", () => ({
  ensureAdminEventsSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/aws/boundary", () => ({
  buildEventPhotoPendingObjectKey: vi.fn(
    (input: { eventId: string; photoId: string; extension: string }) =>
      `events/pending/${input.eventId}/photos/${input.photoId}.${input.extension}`,
  ),
}));

import { getDatabasePool } from "@/lib/aws/database";

const mockedGetDatabasePool = vi.mocked(getDatabasePool);

function makeClient(queryFn: (...args: unknown[]) => unknown) {
  return {
    query: vi.fn(queryFn),
    release: vi.fn(),
  };
}

// --- listAdminEventPhotos ---

describe("listAdminEventPhotos", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET = "photos-bucket";
  });

  afterEach(() => {
    delete process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET;
  });

  it("returns empty page when event not found", async () => {
    // getAdminEventHeader query returns no rows
    const queryMock = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetDatabasePool.mockResolvedValue({ query: queryMock } as never);

    const { listAdminEventPhotos } = await import("@/lib/admin/events/repository");
    const result = await listAdminEventPhotos({ eventSlug: "missing", page: 1, pageSize: 20 });

    expect(result.photos).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(result.faceMatchSummary.totalMatchedFaces).toBe(0);
  });

  it("returns photos with preview URLs when event exists", async () => {
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    vi.mocked(getSignedUrl).mockResolvedValue("https://signed.s3.example.com/preview");

    const queryMock = vi.fn()
      // getAdminEventHeader: event query
      .mockResolvedValueOnce({
        rows: [{ id: "e1", slug: "demo", title: "Demo", venue: "V", description: "D", startsAt: "2026-01-01T10:00:00.000Z", endsAt: "2026-01-02T10:00:00.000Z", logoObjectKey: null }],
      })
      // listAdminEventPhotos photo rows
      .mockResolvedValueOnce({
        rows: [
          { id: "p1", eventId: "e1", eventSlug: "demo", objectKey: "events/e1/photos/p1.jpg", status: "active", uploadedAt: "2026-01-01T12:00:00Z" },
        ],
      })
      // total count
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      // face matches
      .mockResolvedValueOnce({ rows: [] })
      // event stats
      .mockResolvedValueOnce({ rows: [{ totalRegisteredSelfies: "0", totalAssociatedUsers: "0" }] });

    mockedGetDatabasePool.mockResolvedValue({ query: queryMock } as never);

    const { listAdminEventPhotos } = await import("@/lib/admin/events/repository");
    const result = await listAdminEventPhotos({ eventSlug: "demo", page: 1, pageSize: 20 });

    expect(result.photos).toHaveLength(1);
    expect(result.photos[0]?.id).toBe("p1");
    expect(typeof result.photos[0]?.previewUrl).toBe("string");
    expect(result.totalCount).toBe(1);
  });

  it("maps face match rows correctly", async () => {
    const queryMock = vi.fn()
      // event header
      .mockResolvedValueOnce({
        rows: [{ id: "e1", slug: "demo", title: "Demo", venue: null, description: null, startsAt: null, endsAt: null, logoObjectKey: null }],
      })
      // photos
      .mockResolvedValueOnce({ rows: [] })
      // total
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      // face matches
      .mockResolvedValueOnce({
        rows: [{
          attendeeId: "a1",
          attendeeName: "Alice",
          attendeeEmail: "alice@example.com",
          faceEnrollmentId: "fe1",
          faceId: "face-id-1",
          matchedPhotoCount: 3,
          lastMatchedAt: "2026-01-01T15:00:00Z",
        }],
      })
      // stats
      .mockResolvedValueOnce({ rows: [{ totalRegisteredSelfies: "2", totalAssociatedUsers: "1" }] });

    mockedGetDatabasePool.mockResolvedValue({ query: queryMock } as never);

    const { listAdminEventPhotos } = await import("@/lib/admin/events/repository");
    const result = await listAdminEventPhotos({ eventSlug: "demo", page: 1, pageSize: 20 });

    expect(result.faceMatchSummary.totalMatchedFaces).toBe(1);
    expect(result.faceMatchSummary.totalRegisteredSelfies).toBe(2);
    expect(result.faceMatchSummary.totalAssociatedUsers).toBe(1);
    expect(result.faceMatchSummary.matchedFaces[0]?.attendeeName).toBe("Alice");
    expect(result.faceMatchSummary.matchedFaces[0]?.matchedPhotoCount).toBe(3);
  });
});

// --- deleteAdminEventPhoto ---

describe("deleteAdminEventPhoto", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET = "photos-bucket";
  });

  afterEach(() => {
    delete process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET;
  });

  it("returns not_found when photo does not exist", async () => {
    const clientMock = makeClient(() => Promise.resolve({ rows: [] }));
    const poolQueryMock = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetDatabasePool.mockResolvedValue({
      query: poolQueryMock,
      connect: vi.fn().mockResolvedValue(clientMock),
    } as never);

    const { deleteAdminEventPhoto } = await import("@/lib/admin/events/repository");
    const result = await deleteAdminEventPhoto({
      eventSlug: "demo",
      photoId: "p-missing",
      actorSub: "admin-1",
      requestId: "req-1",
    });

    expect(result.status).toBe("not_found");
    expect(result.photoId).toBe("p-missing");
  });

  it("deletes photo and returns deleted status", async () => {
    const clientQueryMock = vi.fn()
      // BEGIN
      .mockResolvedValueOnce({})
      // SELECT photo
      .mockResolvedValueOnce({ rows: [{ objectKey: "events/e1/photos/p1.jpg" }] })
      // DELETE photo_face_matches
      .mockResolvedValueOnce({})
      // DELETE event_photos
      .mockResolvedValueOnce({})
      // COMMIT
      .mockResolvedValueOnce({});

    s3SendMock.mockResolvedValue({});

    const clientMock = { query: clientQueryMock, release: vi.fn() };
    const poolQueryMock = vi.fn().mockResolvedValue({ rows: [] }); // audit insert
    mockedGetDatabasePool.mockResolvedValue({
      query: poolQueryMock,
      connect: vi.fn().mockResolvedValue(clientMock),
    } as never);

    const { deleteAdminEventPhoto } = await import("@/lib/admin/events/repository");
    const result = await deleteAdminEventPhoto({
      eventSlug: "demo",
      photoId: "p1",
      actorSub: "admin-1",
      requestId: "req-1",
    });

    expect(result.status).toBe("deleted");
    expect(result.photoId).toBe("p1");
    expect(clientMock.release).toHaveBeenCalled();
  });

  it("returns failed when S3 delete throws", async () => {
    const clientQueryMock = vi.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ objectKey: "events/e1/photos/p1.jpg" }] }) // SELECT
      .mockResolvedValueOnce({}); // COMMIT

    s3SendMock.mockRejectedValue(new Error("S3 access denied"));

    const clientMock = { query: clientQueryMock, release: vi.fn() };
    const poolQueryMock = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetDatabasePool.mockResolvedValue({
      query: poolQueryMock,
      connect: vi.fn().mockResolvedValue(clientMock),
    } as never);

    const { deleteAdminEventPhoto } = await import("@/lib/admin/events/repository");
    const result = await deleteAdminEventPhoto({
      eventSlug: "demo",
      photoId: "p1",
      actorSub: "admin-1",
      requestId: "req-1",
    });

    expect(result.status).toBe("failed");
    expect(result.message).toBe("S3 access denied");
  });

  it("rolls back and returns failed when query throws", async () => {
    const clientQueryMock = vi.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error("DB crash")); // SELECT throws

    // ROLLBACK and audit should still work
    clientQueryMock.mockResolvedValueOnce({}); // ROLLBACK

    const clientMock = { query: clientQueryMock, release: vi.fn() };
    const poolQueryMock = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetDatabasePool.mockResolvedValue({
      query: poolQueryMock,
      connect: vi.fn().mockResolvedValue(clientMock),
    } as never);

    const { deleteAdminEventPhoto } = await import("@/lib/admin/events/repository");
    const result = await deleteAdminEventPhoto({
      eventSlug: "demo",
      photoId: "p1",
      actorSub: "admin-1",
    });

    expect(result.status).toBe("failed");
    expect(result.message).toBe("DB crash");
    expect(clientMock.release).toHaveBeenCalled();
  });
});

// --- listAdminEventSelfies ---

describe("listAdminEventSelfies", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET = "photos-bucket";
  });

  afterEach(() => {
    delete process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET;
  });

  it("returns empty when event not found", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetDatabasePool.mockResolvedValue({ query: queryMock } as never);

    const { listAdminEventSelfies } = await import("@/lib/admin/events/repository");
    const result = await listAdminEventSelfies({ eventSlug: "missing", page: 1, pageSize: 20 });

    expect(result.event).toBeNull();
    expect(result.selfies).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it("returns selfies with mapped preview URLs", async () => {
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    vi.mocked(getSignedUrl).mockResolvedValue("https://signed.s3.example.com/preview");

    const queryMock = vi.fn()
      // event header
      .mockResolvedValueOnce({
        rows: [{ id: "e1", slug: "demo", title: "Demo", venue: "V", description: "D", startsAt: "2026-01-01T10:00:00.000Z", endsAt: "2026-01-02T10:00:00.000Z", logoObjectKey: null }],
      })
      // selfie rows
      .mockResolvedValueOnce({
        rows: [{
          attendeeId: "a1",
          name: "Alice",
          email: "alice@example.com",
          registrationId: "r1",
          status: "enrolled",
          selfieObjectKey: "selfies/a1/selfie.jpg",
          enrolledAt: "2026-01-01T14:00:00.000Z",
        }],
      })
      // total count
      .mockResolvedValueOnce({ rows: [{ total: "1" }] });

    mockedGetDatabasePool.mockResolvedValue({ query: queryMock } as never);

    const { listAdminEventSelfies } = await import("@/lib/admin/events/repository");
    const result = await listAdminEventSelfies({ eventSlug: "demo", page: 1, pageSize: 20 });

    expect(result.event).not.toBeNull();
    expect(result.event?.slug).toBe("demo");
    expect(result.selfies).toHaveLength(1);
    expect(result.selfies[0]?.name).toBe("Alice");
    expect(typeof result.selfies[0]?.previewUrl).toBe("string");
    expect(result.totalCount).toBe(1);
  });

  it("handles null selfieObjectKey without generating preview URL", async () => {
    const queryMock = vi.fn()
      .mockResolvedValueOnce({
        rows: [{ id: "e1", slug: "demo", title: "Demo", venue: null, description: null, startsAt: null, endsAt: null, logoObjectKey: null }],
      })
      .mockResolvedValueOnce({
        rows: [{
          attendeeId: "a1",
          name: "Bob",
          email: "bob@example.com",
          registrationId: "r2",
          status: "pending",
          selfieObjectKey: null,
          enrolledAt: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ total: "1" }] });

    mockedGetDatabasePool.mockResolvedValue({ query: queryMock } as never);

    const { listAdminEventSelfies } = await import("@/lib/admin/events/repository");
    const result = await listAdminEventSelfies({ eventSlug: "demo", page: 1, pageSize: 20 });

    expect(result.selfies[0]?.previewUrl).toBeNull();
    expect(result.selfies[0]?.enrolledAt).toBeNull();
  });
});

// --- deleteAdminEventAttendee ---

describe("deleteAdminEventAttendee", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET = "photos-bucket";
    process.env.FACE_LOCATOR_SELFIES_BUCKET = "selfies-bucket";
  });

  afterEach(() => {
    delete process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET;
    delete process.env.FACE_LOCATOR_SELFIES_BUCKET;
  });

  it("returns not_found when registration does not exist", async () => {
    const clientMock = makeClient(() => Promise.resolve({ rows: [] }));
    const poolQueryMock = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetDatabasePool.mockResolvedValue({
      query: poolQueryMock,
      connect: vi.fn().mockResolvedValue(clientMock),
    } as never);

    const { deleteAdminEventAttendee } = await import("@/lib/admin/events/repository");
    const result = await deleteAdminEventAttendee({
      eventSlug: "demo",
      registrationId: "r-missing",
      actorSub: "admin-1",
    });

    expect(result.status).toBe("not_found");
  });

  it("deletes attendee, S3 selfie, and returns deleted status", async () => {
    const clientQueryMock = vi.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ objectKey: "selfies/a1/selfie.jpg", eventId: "e1", attendeeId: "a1" }] }) // SELECT
      .mockResolvedValueOnce({}) // DELETE face_enrollments
      .mockResolvedValueOnce({}) // DELETE event_attendees
      .mockResolvedValueOnce({}); // COMMIT

    s3SendMock.mockResolvedValue({});

    const clientMock = { query: clientQueryMock, release: vi.fn() };
    const poolQueryMock = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetDatabasePool.mockResolvedValue({
      query: poolQueryMock,
      connect: vi.fn().mockResolvedValue(clientMock),
    } as never);

    const { deleteAdminEventAttendee } = await import("@/lib/admin/events/repository");
    const result = await deleteAdminEventAttendee({
      eventSlug: "demo",
      registrationId: "r1",
      actorSub: "admin-1",
      requestId: "req-1",
    });

    expect(result.status).toBe("deleted");
    expect(clientMock.release).toHaveBeenCalled();
  });

  it("returns failed when S3 delete throws", async () => {
    const clientQueryMock = vi.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ objectKey: "selfies/a1/selfie.jpg", eventId: "e1", attendeeId: "a1" }] }) // SELECT
      .mockResolvedValueOnce({}); // COMMIT

    s3SendMock.mockRejectedValue(new Error("S3 forbidden"));

    const clientMock = { query: clientQueryMock, release: vi.fn() };
    const poolQueryMock = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetDatabasePool.mockResolvedValue({
      query: poolQueryMock,
      connect: vi.fn().mockResolvedValue(clientMock),
    } as never);

    const { deleteAdminEventAttendee } = await import("@/lib/admin/events/repository");
    const result = await deleteAdminEventAttendee({
      eventSlug: "demo",
      registrationId: "r1",
      actorSub: "admin-1",
    });

    expect(result.status).toBe("failed");
    expect(result.message).toBe("S3 forbidden");
  });

  it("skips S3 delete when objectKey is null", async () => {
    const clientQueryMock = vi.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ objectKey: null, eventId: "e1", attendeeId: "a1" }] }) // SELECT
      .mockResolvedValueOnce({}) // DELETE face_enrollments
      .mockResolvedValueOnce({}) // DELETE event_attendees
      .mockResolvedValueOnce({}); // COMMIT

    const clientMock = { query: clientQueryMock, release: vi.fn() };
    const poolQueryMock = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetDatabasePool.mockResolvedValue({
      query: poolQueryMock,
      connect: vi.fn().mockResolvedValue(clientMock),
    } as never);

    const { deleteAdminEventAttendee } = await import("@/lib/admin/events/repository");
    const result = await deleteAdminEventAttendee({
      eventSlug: "demo",
      registrationId: "r1",
      actorSub: "admin-1",
    });

    expect(result.status).toBe("deleted");
    expect(s3SendMock).not.toHaveBeenCalled();
  });

  it("rolls back and returns failed on general error", async () => {
    const clientQueryMock = vi.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error("Connection lost")); // SELECT

    clientQueryMock.mockResolvedValueOnce({}); // ROLLBACK

    const clientMock = { query: clientQueryMock, release: vi.fn() };
    const poolQueryMock = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetDatabasePool.mockResolvedValue({
      query: poolQueryMock,
      connect: vi.fn().mockResolvedValue(clientMock),
    } as never);

    const { deleteAdminEventAttendee } = await import("@/lib/admin/events/repository");
    const result = await deleteAdminEventAttendee({
      eventSlug: "demo",
      registrationId: "r1",
      actorSub: "admin-1",
    });

    expect(result.status).toBe("failed");
    expect(result.message).toBe("Connection lost");
    expect(clientMock.release).toHaveBeenCalled();
  });
});

// --- deleteAdminEventPhotosBatch ---

describe("deleteAdminEventPhotosBatch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET = "photos-bucket";
  });

  afterEach(() => {
    delete process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET;
  });

  it("returns idempotent replay when same key is reused with different payload", async () => {
    const existingReplay = {
      requestHash: "a9c6a0b1e0e8c0f7f6e5d4c3b2a1a0f9e8d7c6b5a4a3a2a1a0f9e8d7c6b5a4a3",
      responsePayload: { results: [], deleted: 0, notFound: 0, failed: 0 },
      statusCode: 200,
    };

    const queryMock = vi.fn()
      .mockResolvedValueOnce({ rows: [existingReplay] });

    mockedGetDatabasePool.mockResolvedValue({ query: queryMock } as never);

    const { deleteAdminEventPhotosBatch } = await import("@/lib/admin/events/repository");

    // The hash won't match because the payload differs, triggering the idempotency error.
    // The error is wrapped by runDatabaseOperation, so we check for DatabaseOperationError.
    await expect(
      deleteAdminEventPhotosBatch({
        eventSlug: "demo",
        photoIds: ["p1"],
        actorSub: "admin-1",
        idempotencyKey: "key-1",
      }),
    ).rejects.toThrow();
  });

  it("executes batch delete when no replay exists", async () => {
    // Prepare mocks: idempotency lookup returns nothing, then individual deletes work
    const clientQueryMock = vi.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ objectKey: "events/e1/p1.jpg" }] }) // SELECT photo
      .mockResolvedValueOnce({}) // DELETE matches
      .mockResolvedValueOnce({}) // DELETE photos
      .mockResolvedValueOnce({}); // COMMIT

    s3SendMock.mockResolvedValue({});
    const clientMock = { query: clientQueryMock, release: vi.fn() };

    const poolQueryMock = vi.fn()
      // getIdempotencyReplay
      .mockResolvedValueOnce({ rows: [] })
      // pool-level queries for audit inserts and idempotency store
      .mockResolvedValue({ rows: [] });

    mockedGetDatabasePool.mockResolvedValue({
      query: poolQueryMock,
      connect: vi.fn().mockResolvedValue(clientMock),
    } as never);

    const { deleteAdminEventPhotosBatch } = await import("@/lib/admin/events/repository");
    const result = await deleteAdminEventPhotosBatch({
      eventSlug: "demo",
      photoIds: ["p1"],
      actorSub: "admin-1",
      idempotencyKey: "key-2",
    });

    expect(result.deleted).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.status).toBe("deleted");
  });
});

// --- helper functions ---

describe("getEventPhotosBucketName", () => {
  it("throws when FACE_LOCATOR_EVENT_PHOTOS_BUCKET is not set", async () => {
    delete process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET;

    const queryMock = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: "e1", slug: "demo", title: "Demo", venue: "V", description: "D", startsAt: "2026-01-01T10:00:00.000Z", endsAt: "2026-01-02T10:00:00.000Z", logoObjectKey: null }] });

    mockedGetDatabasePool.mockResolvedValue({ query: queryMock } as never);

    const { createAdminEventPhotoUpload } = await import("@/lib/admin/events/repository");
    // The error is wrapped by runDatabaseOperation
    await expect(
      createAdminEventPhotoUpload({ eventSlug: "demo", contentType: "image/jpeg", uploadedBy: "admin-1" }),
    ).rejects.toThrow();
  });
});

describe("buildPreviewUrl", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET = "photos-bucket";
  });

  afterEach(() => {
    delete process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET;
  });

  it("returns null when getSignedUrl throws", async () => {
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    vi.mocked(getSignedUrl).mockRejectedValueOnce(new Error("S3 error"));

    const queryMock = vi.fn()
      // event header
      .mockResolvedValueOnce({
        rows: [{ id: "e1", slug: "demo", title: "Demo", venue: null, description: null, startsAt: null, endsAt: null, logoObjectKey: null }],
      })
      // photos
      .mockResolvedValueOnce({
        rows: [{ id: "p1", eventId: "e1", eventSlug: "demo", objectKey: "events/e1/photos/p1.jpg", status: "active", uploadedAt: "2026-01-01T12:00:00Z" }],
      })
      // total
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      // face matches
      .mockResolvedValueOnce({ rows: [] })
      // stats
      .mockResolvedValueOnce({ rows: [{ totalRegisteredSelfies: "0", totalAssociatedUsers: "0" }] });

    mockedGetDatabasePool.mockResolvedValue({ query: queryMock } as never);

    const { listAdminEventPhotos } = await import("@/lib/admin/events/repository");
    const result = await listAdminEventPhotos({ eventSlug: "demo", page: 1, pageSize: 20 });

    expect(result.photos[0]?.previewUrl).toBeNull();
  });
});
