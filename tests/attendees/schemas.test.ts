import { describe, expect, it } from "vitest";

import {
  normalizeEmail,
  normalizeName,
  validateRegistrationIntentRequest,
} from "@/lib/attendees/schemas";

describe("attendee schemas", () => {
  it("normalizes name and email values", () => {
    expect(normalizeName("  Jane   Doe  ")).toBe("Jane Doe");
    expect(normalizeEmail(" Jane@Example.COM ")).toBe("jane@example.com");
  });

  it("returns a normalized registration payload", () => {
    expect(
      validateRegistrationIntentRequest({
        eventSlug: "speaker-session-2026",
        name: "  Jane   Doe ",
        email: " Jane@Example.COM ",
        contentType: "image/jpeg",
        fileName: "selfie.jpg",
        fileSizeBytes: 1024,
        consentAccepted: true,
      }),
    ).toMatchObject({
      name: "Jane Doe",
      email: "jane@example.com",
    });
  });
});
