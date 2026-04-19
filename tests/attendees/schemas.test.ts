import { describe, expect, it } from "vitest";

import {
  MAX_FILE_SIZE_BYTES,
  normalizeEmail,
  normalizeName,
  validateRegistrationIntentRequest,
} from "@/lib/attendees/schemas";
import { AttendeeApiError } from "@/lib/attendees/errors";

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

  it("rejects invalid registration intent payloads with machine-readable errors", () => {
    expect(() =>
      validateRegistrationIntentRequest({
        eventSlug: "speaker-session-2026",
        name: "J",
        email: "not-an-email",
        contentType: "text/plain",
        fileName: "",
        fileSizeBytes: MAX_FILE_SIZE_BYTES + 1,
        consentAccepted: false,
      }),
    ).toThrowError(AttendeeApiError);

    try {
      validateRegistrationIntentRequest({
        eventSlug: "speaker-session-2026",
        name: "Jane Doe",
        email: "jane@example.com",
        contentType: "text/plain",
        fileName: "selfie.txt",
        fileSizeBytes: 1024,
        consentAccepted: true,
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: "UNSUPPORTED_CONTENT_TYPE",
        field: "selfie",
      });
    }
  });
});
