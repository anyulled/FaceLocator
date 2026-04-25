import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = sendMock;
  },
  CopyObjectCommand: class {
    constructor(public input: unknown) {}
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed.example.com/p1"),
}));

vi.mock("server-only", () => ({}));

import { Pool } from "pg";
import { getDatabasePool } from "@/lib/aws/database";
vi.mock("@/lib/aws/database", () => ({
  getDatabasePool: vi.fn(),
}));

const mockedGetDatabasePool = vi.mocked(getDatabasePool);
const mockPool = { query: vi.fn() };

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
const mockedGetSignedUrl = vi.mocked(getSignedUrl);

describe("admin backend — direct mode implementation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetDatabasePool.mockResolvedValue(mockPool as unknown as Pool);
    mockedGetSignedUrl.mockResolvedValue("https://signed.example.com/p1");
    process.env.ADMIN_READ_BACKEND = "direct";
    process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET = "test-bucket";
  });

  it("getAdminEventPhotosPageViaBackend returns null if event missing", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    
    const { getAdminEventPhotosPageViaBackend } = await import("@/lib/admin/events/backend");
    const result = await getAdminEventPhotosPageViaBackend({ eventSlug: "missing", page: 1, pageSize: 10 });
    
    expect(result.event).toBeNull();
  });

  it("getAdminEventPhotosPageViaBackend returns full results when event exists", async () => {
    // 1. Event header
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: "e1", slug: "demo", title: "Demo", venue: null, description: null, startsAt: null, endsAt: null, logoObjectKey: null }]
    });

    // 2. Promise.all: [rows, total, faceMatches, eventStats]
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: "p1", eventId: "e1", eventSlug: "demo", objectKey: "o1", status: "ready", uploadedAt: new Date().toISOString() }] })
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [{
          attendeeId: "a1", attendeeName: "Alice", attendeeEmail: "alice@example.com",
          faceEnrollmentId: "fe1", faceId: "f1", matchedPhotoCount: 1, lastMatchedAt: null
        }]
      })
      .mockResolvedValueOnce({ rows: [{ totalRegisteredSelfies: "5", totalAssociatedUsers: "10" }] });

    const { getAdminEventPhotosPageViaBackend } = await import("@/lib/admin/events/backend");
    const result = await getAdminEventPhotosPageViaBackend({ eventSlug: "demo", page: 1, pageSize: 10 });

    expect(result.event?.id).toBe("e1");
    expect(result.photos).toHaveLength(1);
    expect(result.faceMatchSummary.totalMatchedFaces).toBe(1);
    expect(result.faceMatchSummary.matchedFaces[0].attendeeName).toBe("Alice");
  });

  it("reprocessAdminEventPhotosViaBackend returns null if event missing", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    
    const { reprocessAdminEventPhotosViaBackend } = await import("@/lib/admin/events/backend");
    const result = await reprocessAdminEventPhotosViaBackend({ eventSlug: "missing" });
    
    expect(result).toBeNull();
  });

  it("reprocessAdminEventPhotosViaBackend performs S3 copies and returns summary", async () => {
    // Event header
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: "e1" }] });
    // Photos to reprocess
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: "p1", objectKey: "events/pending/e1/photos/p1.jpg" }] });
    // S3 mock
    sendMock.mockResolvedValue({});

    const { reprocessAdminEventPhotosViaBackend } = await import("@/lib/admin/events/backend");
    const result = await reprocessAdminEventPhotosViaBackend({ eventSlug: "demo" });

    expect(result?.total).toBe(1);
    expect(result?.queued).toBe(1);
    expect(sendMock).toHaveBeenCalled();
  });

  it("reprocessAdminEventPhotosViaBackend records failed count when S3 copy throws", async () => {
    // Event header
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: "e1" }] });
    // Photos to reprocess
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: "p1", objectKey: "o1" }] });
    // S3 mock throws
    sendMock.mockRejectedValueOnce(new Error("S3 fail"));

    const { reprocessAdminEventPhotosViaBackend } = await import("@/lib/admin/events/backend");
    const result = await reprocessAdminEventPhotosViaBackend({ eventSlug: "demo" });

    expect(result?.failed).toBe(1);
    expect(result?.queued).toBe(0);
  });

  it("createAdminEventPhotoUploadViaBackend returns presign response", async () => {
    // Ensure all queries in this test return a valid event header
    mockPool.query.mockImplementation(async () => ({ 
      rows: [{ id: "e1", slug: "demo", title: "D", venue: "V", description: "D", startsAt: "2026-01-01T10:00:00Z", endsAt: "2026-01-01T11:00:00Z", logoObjectKey: null }] 
    }));
    
    const { createAdminEventPhotoUploadViaBackend } = await import("@/lib/admin/events/backend");
    const result = await createAdminEventPhotoUploadViaBackend({
      eventSlug: "demo",
      contentType: "image/jpeg",
      uploadedBy: "admin1"
    });
    
    expect(result?.photo.uploadedBy).toBe("admin1");
    expect(result?.upload.url).toContain("example.com");
  });
});
