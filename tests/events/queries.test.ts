import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getEventBySlug,
  getEventRegistrationPageData,
} from "@/lib/events/queries";

const queryMock = vi.fn();

vi.mock("@/lib/aws/database", () => ({
  getDatabasePool: async () => ({
    query: queryMock,
  }),
}));

describe("event queries", () => {
  beforeEach(() => {
    queryMock.mockReset();
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns event metadata for a known slug", async () => {
    await expect(getEventBySlug("speaker-session-2026")).resolves.toMatchObject({
      slug: "speaker-session-2026",
      title: "DevBcn 2026",
      venue: "World Trade Center, Barcelona",
    });
  });

  it("returns page-shell data with narrowed client form props", async () => {
    await expect(getEventRegistrationPageData("speaker-session-2026")).resolves.toMatchObject({
      eyebrow: "Event registration",
      supportCopy: expect.stringContaining("live event record"),
      formattedScheduledAt: "June 16-17, 2026",
      formProps: {
        eventSlug: "speaker-session-2026",
        eventTitle: "DevBcn 2026",
      },
    });
  });

  it("returns null for an unknown slug", async () => {
    await expect(getEventRegistrationPageData("missing-event")).resolves.toBeNull();
  });

  it("loads live event metadata from the database when available", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AWS_REGION", "eu-west-1");
    vi.stubEnv("FACE_LOCATOR_EVENT_LOGOS_BUCKET", "face-locator-poc-event-logos");
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          slug: "cantus-laudis-2026",
          title: "Cantus Laudis",
          venue: "Auditorium",
          description: "A live event stored in Postgres.",
          scheduledAt: "2026-09-10T10:00:00.000Z",
          endsAt: "2026-09-10T18:00:00.000Z",
          logoObjectKey: "events/cantus-laudis-2026/logos/logo.svg",
        },
      ],
    });

    await expect(getEventBySlug("cantus-laudis-2026")).resolves.toMatchObject({
      slug: "cantus-laudis-2026",
      title: "Cantus Laudis",
      venue: "Auditorium",
      description: "A live event stored in Postgres.",
      logoUrl:
        "https://face-locator-poc-event-logos.s3.eu-west-1.amazonaws.com/events/cantus-laudis-2026/logos/logo.svg",
    });
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("FROM events"),
      ["cantus-laudis-2026"],
    );
  });

  it("falls back safely when live event dates are malformed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          slug: "cantus-laudis-2026",
          title: "Cantus Laudis",
          venue: "Auditorium",
          description: "A live event stored in Postgres.",
          scheduledAt: "not-a-date",
          endsAt: "also-not-a-date",
        },
      ],
    });

    await expect(getEventRegistrationPageData("cantus-laudis-2026")).resolves.toMatchObject({
      slug: "cantus-laudis-2026",
      title: "Cantus Laudis",
      formattedScheduledAt: "Date to be announced",
    });
  });

  it("handles us-east-1 S3 URLs", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AWS_REGION", "us-east-1");
    vi.stubEnv("FACE_LOCATOR_EVENT_LOGOS_BUCKET", "logos");
    queryMock.mockResolvedValueOnce({
      rows: [{ slug: "s", title: "T", venue: "V", description: "D", scheduledAt: "2026-01-01T00:00:00Z", endsAt: null, logoObjectKey: "l.png" }],
    });
    const result = await getEventBySlug("s");
    expect(result?.logoUrl).toBe("https://logos.s3.amazonaws.com/l.png");
  });

  it("handles missing logos bucket or key", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FACE_LOCATOR_EVENT_LOGOS_BUCKET", "");
    queryMock.mockResolvedValueOnce({
      rows: [{ slug: "s", title: "T", venue: "V", description: "D", scheduledAt: "2026-01-01T00:00:00Z", endsAt: null, logoObjectKey: "l.png" }],
    });
    const result = await getEventBySlug("s");
    expect(result?.logoUrl).toBeUndefined();
  });

  it("getFeaturedEventSlug returns latest event or an empty fallback", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { getFeaturedEventSlug } = await import("@/lib/events/queries");

    queryMock.mockResolvedValueOnce({ rows: [{ slug: "latest" }] });
    await expect(getFeaturedEventSlug()).resolves.toBe("latest");

    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(getFeaturedEventSlug()).resolves.toBe("");

    queryMock.mockRejectedValueOnce(new Error("DB fail"));
    await expect(getFeaturedEventSlug()).resolves.toBe("");
  });

  it("formatEventDate handles various date combinations", async () => {
    vi.stubEnv("NODE_ENV", "production");

    queryMock.mockResolvedValueOnce({ rows: [{ slug: "s", title: "T", venue: "V", description: "D", scheduledAt: "2026-01-01T10:00:00Z", endsAt: null }] });
    let res = await getEventRegistrationPageData("s");
    expect(res?.formattedScheduledAt).toBe("January 1, 2026");

    queryMock.mockResolvedValueOnce({ rows: [{ slug: "s", title: "T", venue: "V", description: "D", scheduledAt: "2026-01-01T10:00:00Z", endsAt: "2026-01-03T10:00:00Z" }] });
    res = await getEventRegistrationPageData("s");
    expect(res?.formattedScheduledAt).toBe("January 1-3, 2026");

    queryMock.mockResolvedValueOnce({ rows: [{ slug: "s", title: "T", venue: "V", description: "D", scheduledAt: "2026-01-31T10:00:00Z", endsAt: "2026-02-02T10:00:00Z" }] });
    res = await getEventRegistrationPageData("s");
    expect(res?.formattedScheduledAt).toBe("January 31, 2026 - February 2, 2026");
  });

  it("getEventBySlug falls back to the demo event only for the demo slug", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    queryMock.mockRejectedValueOnce(new Error("DB failure"));
    const demoResult = await getEventBySlug("speaker-session-2026");
    expect(demoResult?.slug).toBe("speaker-session-2026");

    queryMock.mockRejectedValueOnce(new Error("DB failure"));
    await expect(getEventBySlug("other")).rejects.toThrow("DB failure");
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("formatEventDate handles invalid end dates", async () => {
    vi.stubEnv("NODE_ENV", "production");

    queryMock.mockResolvedValueOnce({ rows: [{ slug: "s", title: "T", venue: "V", description: "D", scheduledAt: "2026-01-01T10:00:00Z", endsAt: "invalid-date" }] });
    const res = await getEventRegistrationPageData("s");
    expect(res?.formattedScheduledAt).toBe("January 1, 2026");
  });
});
