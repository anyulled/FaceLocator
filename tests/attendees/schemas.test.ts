import { describe, expect, it } from "vitest";

import {
  MAX_FILE_NAME_LENGTH,
  MAX_FILE_SIZE_BYTES,
  NAME_LENGTH_RANGE,
  getRegistrationCompleteValidationIssues,
  getRegistrationIntentValidationIssues,
  normalizeEmail,
  normalizeFileName,
  normalizeName,
  validateRegistrationIntentRequest,
} from "@/lib/attendees/schemas";
import { AttendeeApiError } from "@/lib/attendees/errors";

describe("attendee schemas", () => {
  it("normalizes name and email values", () => {
    expect(normalizeName("  Jane   Doe  ")).toBe("Jane Doe");
    expect(normalizeEmail(" Jane@Example.COM ")).toBe("jane@example.com");
    expect(normalizeFileName(" selfie.jpg  ")).toBe("selfie.jpg");
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

  it("returns machine-readable issues for client-side inspection", () => {
    expect(
      getRegistrationIntentValidationIssues({
        eventSlug: "",
        name: "J",
        email: "bad-email",
        contentType: "application/pdf",
        fileName: "x".repeat(MAX_FILE_NAME_LENGTH + 1),
        fileSizeBytes: MAX_FILE_SIZE_BYTES + 1,
        consentAccepted: false,
      }),
    ).toEqual([
      {
        code: "INVALID_EVENT",
        message: "Event slug is required.",
      },
      {
        code: "INVALID_NAME",
        message: "Please enter your full name.",
        field: "name",
      },
      {
        code: "INVALID_EMAIL",
        message: "Email address is invalid.",
        field: "email",
      },
      {
        code: "CONSENT_REQUIRED",
        message: "Consent is required.",
        field: "consentAccepted",
      },
      {
        code: "MISSING_FILE",
        message: "The selected file name is too long.",
        field: "selfie",
      },
      {
        code: "UNSUPPORTED_CONTENT_TYPE",
        message: "Only JPEG, PNG, and WEBP images are supported.",
        field: "selfie",
      },
      {
        code: "FILE_TOO_LARGE",
        message: "The selected file is too large.",
        field: "selfie",
      },
    ]);
  });

  it("validates completion payload issues without throwing", () => {
    expect(
      getRegistrationCompleteValidationIssues({
        registrationId: "",
        uploadCompletedAt: "not-a-date",
      }),
    ).toEqual([
      {
        code: "REGISTRATION_NOT_FOUND",
        message: "Registration id is required.",
      },
      {
        code: "INTERNAL_ERROR",
        message: "Upload completion timestamp is invalid.",
      },
    ]);
  });

  it("exports the expected name length boundaries", () => {
    expect(NAME_LENGTH_RANGE).toEqual({ min: 2, max: 120 });
  });
});
