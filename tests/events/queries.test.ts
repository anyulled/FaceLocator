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
    await expect(
      getEventRegistrationPageData("speaker-session-2026"),
    ).resolves.toMatchObject({
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
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          slug: "cantus-laudis-2026",
          title: "Cantus Laudis",
          venue: "Auditorium",
          description: "A live event stored in Postgres.",
          scheduledAt: "2026-09-10T10:00:00.000Z",
          endsAt: "2026-09-10T18:00:00.000Z",
        },
      ],
    });

    await expect(getEventBySlug("cantus-laudis-2026")).resolves.toMatchObject({
      slug: "cantus-laudis-2026",
      title: "Cantus Laudis",
      venue: "Auditorium",
      description: "A live event stored in Postgres.",
    });
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("FROM events"),
      ["cantus-laudis-2026"],
    );
  });
});
