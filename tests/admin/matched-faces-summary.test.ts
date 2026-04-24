import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("@/lib/admin/events/schema", () => ({
  ensureAdminEventsSchema: vi.fn(async () => undefined),
}));

vi.mock("@/lib/aws/database", () => ({
  getDatabasePool: async () => ({
    query: (...args: unknown[]) => queryMock(...args),
  }),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  DeleteObjectCommand: class DeleteObjectCommand {},
  GetObjectCommand: class GetObjectCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  },
  PutObjectCommand: class PutObjectCommand {},
  S3Client: class S3Client {
    config: unknown;

    constructor(config: unknown) {
      this.config = config;
    }
  },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://signed.example.test/photo.jpg"),
}));

import { listAdminEventPhotos } from "@/lib/admin/events/repository";

describe("admin matched faces summary", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("does not filter matched faces down to the latest face enrollment only", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "event-1",
            slug: "cantus-laudis-2026",
            title: "Cantus Laudis",
            venue: "Gracia, Barcelona",
            description: "Cantvs Orbis",
            startsAt: "2026-04-26T16:00:00.000Z",
            endsAt: "2026-04-26T17:00:00.000Z",
            logoObjectKey: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            attendeeId: "att_raquel",
            attendeeName: "Raquel Campomás",
            attendeeEmail: "raquel@example.com",
            faceEnrollmentId: "face-latest",
            faceId: "rek-face-latest",
            matchedPhotoCount: 12,
            lastMatchedAt: "2026-04-23T22:50:45.259Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            totalRegisteredSelfies: "7",
            totalAssociatedUsers: "6",
          },
        ],
      });

    const result = await listAdminEventPhotos({
      eventSlug: "cantus-laudis-2026",
      page: 1,
      pageSize: 100,
    });

    const faceMatchQuery = String(queryMock.mock.calls[3]?.[0] ?? "");
    expect(faceMatchQuery).not.toContain("m.face_enrollment_id =");
    expect(faceMatchQuery).toContain("latest_face.id AS \"faceEnrollmentId\"");

    expect(result.faceMatchSummary.matchedFaces).toEqual([
      {
        attendeeId: "att_raquel",
        attendeeName: "Raquel Campomás",
        attendeeEmail: "raquel@example.com",
        faceEnrollmentId: "face-latest",
        faceId: "rek-face-latest",
        matchedPhotoCount: 12,
        lastMatchedAt: "2026-04-23T22:50:45.259Z",
      },
    ]);
  });
});
