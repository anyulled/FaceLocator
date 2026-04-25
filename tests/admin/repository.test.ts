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
  getSignedUrl: vi.fn().mockResolvedValue("https://signed.s3.example.com/upload"),
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


describe("listAdminEvents", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns mapped event rows", async () => {
    const queryMock = vi.fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "e1",
            slug: "demo",
            title: "Demo Event",
            venue: "Venue",
            description: "Desc",
            startsAt: "2026-01-01T10:00:00.000Z",
            endsAt: "2026-01-02T10:00:00.000Z",
            logoObjectKey: null,
            photoCount: "3",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: "1" }] });

    mockedGetDatabasePool.mockResolvedValue({ query: queryMock } as never);

    const { listAdminEvents } = await import("@/lib/admin/events/repository");
    const result = await listAdminEvents({ page: 1, pageSize: 30 });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      id: "e1",
      slug: "demo",
      title: "Demo Event",
      photoCount: 3,
    });
    expect(result.totalCount).toBe(1);
  });

  it("returns empty list when no events exist", async () => {
    const queryMock = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "0" }] });
    mockedGetDatabasePool.mockResolvedValue({ query: queryMock } as never);

    const { listAdminEvents } = await import("@/lib/admin/events/repository");
    const result = await listAdminEvents({ page: 1, pageSize: 30 });

    expect(result.events).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it("defaults null venue and description to empty string", async () => {
    const queryMock = vi.fn()
      .mockResolvedValueOnce({
        rows: [
          { id: "e1", slug: "demo", title: "Demo", venue: null, description: null, startsAt: "2026-01-01T10:00:00.000Z", endsAt: "2026-01-02T10:00:00.000Z", logoObjectKey: null, photoCount: "0" },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: "1" }] });
    mockedGetDatabasePool.mockResolvedValue({ query: queryMock } as never);

    const { listAdminEvents } = await import("@/lib/admin/events/repository");
    const result = await listAdminEvents({ page: 1, pageSize: 30 });

    expect(result.events[0]?.venue).toBe("");
    expect(result.events[0]?.description).toBe("");
  });

  it("uses endsAt fallback to startsAt when endsAt is null", async () => {
    const queryMock = vi.fn()
      .mockResolvedValueOnce({
        rows: [
          { id: "e1", slug: "demo", title: "Demo", venue: "", description: "", startsAt: "2026-01-01T10:00:00.000Z", endsAt: null, logoObjectKey: null, photoCount: "0" },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: "1" }] });
    mockedGetDatabasePool.mockResolvedValue({ query: queryMock } as never);

    const { listAdminEvents } = await import("@/lib/admin/events/repository");
    const result = await listAdminEvents({ page: 1, pageSize: 30 });

    expect(result.events[0]?.endsAt).toBe("2026-01-01T10:00:00.000Z");
  });
});

describe("createAdminEvent", () => {
  beforeEach(() => vi.resetAllMocks());

  it("inserts event and returns summary", async () => {
    const row = {
      id: "e1",
      slug: "new-event",
      title: "New Event",
      venue: "V",
      description: "D",
      startsAt: "2026-06-01T10:00:00.000Z",
      endsAt: "2026-06-02T10:00:00.000Z",
      logoObjectKey: null,
      photoCount: "0",
    };
    mockedGetDatabasePool.mockResolvedValue({ query: vi.fn().mockResolvedValue({ rows: [row] }) } as never);

    const { createAdminEvent } = await import("@/lib/admin/events/repository");
    const result = await createAdminEvent({
      slug: "new-event",
      title: "New Event",
      venue: "V",
      description: "D",
      startsAt: "2026-06-01T10:00:00.000Z",
      endsAt: "2026-06-02T10:00:00.000Z",
    });

    expect(result.slug).toBe("new-event");
    expect(result.photoCount).toBe(0);
  });

  it("normalizes slug to lowercase and trimmed", async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [{
        id: "e1",
        slug: "my-event",
        title: "My Event",
        venue: "",
        description: "D",
        startsAt: "2026-06-01T10:00:00.000Z",
        endsAt: "2026-06-02T10:00:00.000Z",
        logoObjectKey: null,
        photoCount: "0",
      }],
    });
    mockedGetDatabasePool.mockResolvedValue({ query: queryMock } as never);

    const { createAdminEvent } = await import("@/lib/admin/events/repository");
    await createAdminEvent({
      slug: "  MY-EVENT  ",
      title: "My Event",
      venue: "",
      description: "D",
      startsAt: "2026-06-01T10:00:00.000Z",
      endsAt: "2026-06-02T10:00:00.000Z",
    });

    // slug gets normalized via queryMock args
    const callArgs = queryMock.mock.calls[0] as [string, unknown[]];
    expect(callArgs[1]?.[0]).toBe("my-event");
  });
});

describe("getAdminEventHeader", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns null when event not found", async () => {
    mockedGetDatabasePool.mockResolvedValue({ query: vi.fn().mockResolvedValue({ rows: [] }) } as never);

    const { getAdminEventHeader } = await import("@/lib/admin/events/repository");
    const result = await getAdminEventHeader("missing");
    expect(result).toBeNull();
  });

  it("returns event header when found", async () => {
    mockedGetDatabasePool.mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        rows: [{
          id: "e1",
          slug: "demo",
          title: "Demo",
          venue: "V",
          description: "D",
          startsAt: "2026-01-01T10:00:00.000Z",
          endsAt: "2026-01-02T10:00:00.000Z",
          logoObjectKey: null,
        }],
      }),
    } as never);

    const { getAdminEventHeader } = await import("@/lib/admin/events/repository");
    const result = await getAdminEventHeader("demo");
    expect(result?.id).toBe("e1");
    expect(result?.slug).toBe("demo");
  });
});

describe("createAdminEventPhotoUpload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET = "photos-bucket";
  });

  afterEach(() => {
    delete process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET;
  });

  it("returns null when event not found", async () => {
    mockedGetDatabasePool.mockResolvedValue({ query: vi.fn().mockResolvedValue({ rows: [] }) } as never);

    const { createAdminEventPhotoUpload } = await import("@/lib/admin/events/repository");
    const result = await createAdminEventPhotoUpload({
      eventSlug: "missing",
      contentType: "image/jpeg",
      uploadedBy: "admin-1",
    });
    expect(result).toBeNull();
  });

  it("returns upload contract for existing event", async () => {
    mockedGetDatabasePool.mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        rows: [{ id: "e1", slug: "demo", title: "Demo", venue: "V", description: "D", startsAt: "2026-01-01T10:00:00.000Z", endsAt: "2026-01-02T10:00:00.000Z", logoObjectKey: null }],
      }),
    } as never);

    const { createAdminEventPhotoUpload } = await import("@/lib/admin/events/repository");
    const result = await createAdminEventPhotoUpload({
      eventSlug: "demo",
      contentType: "image/jpeg",
      uploadedBy: "admin-1",
    });

    expect(result).not.toBeNull();
    expect(result?.event.slug).toBe("demo");
    expect(result?.upload.method).toBe("PUT");
    expect(result?.photo.uploadedBy).toBe("admin-1");
  });
});
