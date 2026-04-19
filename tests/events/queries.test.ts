import { describe, expect, it } from "vitest";

import {
  getEventBySlug,
  getEventRegistrationPageData,
} from "@/lib/events/queries";

describe("event queries", () => {
  it("returns event metadata for a known slug", async () => {
    await expect(getEventBySlug("speaker-session-2026")).resolves.toMatchObject({
      slug: "speaker-session-2026",
      title: "Speaker Session 2026",
    });
  });

  it("returns page-shell data with narrowed client form props", async () => {
    await expect(
      getEventRegistrationPageData("speaker-session-2026"),
    ).resolves.toMatchObject({
      eyebrow: "Event registration",
      supportCopy: expect.stringContaining("mock-backed"),
      formattedScheduledAt: expect.any(String),
      formProps: {
        eventSlug: "speaker-session-2026",
        eventTitle: "Speaker Session 2026",
      },
    });
  });

  it("returns null for an unknown slug", async () => {
    await expect(getEventRegistrationPageData("missing-event")).resolves.toBeNull();
  });
});
