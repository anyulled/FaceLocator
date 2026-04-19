import { beforeEach, describe, expect, it } from "vitest";

import { POST as completeRegistration } from "@/app/api/attendees/register/complete/route";
import { POST as createRegistration } from "@/app/api/attendees/register/route";
import { GET as getRegistrationStatus } from "@/app/api/attendees/register/status/[registrationId]/route";

declare global {
  var __faceLocatorEnrollmentStore__: unknown;
}

describe("attendee route handlers", () => {
  beforeEach(() => {
    globalThis.__faceLocatorEnrollmentStore__ = undefined;
  });

  it("creates, completes, and resolves registration status with stable JSON shapes", async () => {
    const registerResponse = await createRegistration(
      new Request("http://localhost/api/attendees/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventSlug: "speaker-session-2026",
          name: "Jane Doe",
          email: "jane@example.com",
          contentType: "image/jpeg",
          fileName: "selfie.jpg",
          fileSizeBytes: 2048,
          consentAccepted: true,
          submissionKey: "route-test-key",
        }),
      }),
    );

    const registration = await registerResponse.json();
    expect(registerResponse.status).toBe(200);
    expect(registration).toMatchObject({
      registrationId: expect.any(String),
      attendeeId: expect.any(String),
      status: "UPLOAD_PENDING",
    });

    const completionResponse = await completeRegistration(
      new Request("http://localhost/api/attendees/register/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          registrationId: registration.registrationId,
          uploadCompletedAt: new Date(Date.now() - 2000).toISOString(),
        }),
      }),
    );

    const completion = await completionResponse.json();
    expect(completionResponse.status).toBe(200);
    expect(completion).toMatchObject({
      registrationId: registration.registrationId,
      status: "PROCESSING",
    });

    const statusResponse = await getRegistrationStatus(
      new Request(
        `http://localhost/api/attendees/register/status/${registration.registrationId}`,
      ),
      {
        params: Promise.resolve({
          registrationId: registration.registrationId,
        }),
      },
    );

    const status = await statusResponse.json();
    expect(statusResponse.status).toBe(200);
    expect(status).toMatchObject({
      registrationId: registration.registrationId,
      status: "ENROLLED",
      message: expect.any(String),
    });
    expect(Object.keys(status).sort()).toEqual(["message", "registrationId", "status"]);
  });

  it("returns a poll-safe pending status before completion", async () => {
    const registerResponse = await createRegistration(
      new Request("http://localhost/api/attendees/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventSlug: "speaker-session-2026",
          name: "Jane Doe",
          email: "jane@example.com",
          contentType: "image/jpeg",
          fileName: "selfie.jpg",
          fileSizeBytes: 2048,
          consentAccepted: true,
          submissionKey: "pending-status-key",
        }),
      }),
    );
    const registration = await registerResponse.json();

    const statusResponse = await getRegistrationStatus(
      new Request(
        `http://localhost/api/attendees/register/status/${registration.registrationId}`,
      ),
      {
        params: Promise.resolve({
          registrationId: registration.registrationId,
        }),
      },
    );
    const status = await statusResponse.json();

    expect(statusResponse.status).toBe(200);
    expect(status).toEqual({
      registrationId: registration.registrationId,
      status: "UPLOAD_PENDING",
      message: "Your registration was created. Selfie upload can start now.",
    });
  });

  it("returns a stable processing payload while the registration is still in progress", async () => {
    const registerResponse = await createRegistration(
      new Request("http://localhost/api/attendees/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventSlug: "speaker-session-2026",
          name: "Jane Doe",
          email: "jane@example.com",
          contentType: "image/jpeg",
          fileName: "selfie.jpg",
          fileSizeBytes: 2048,
          consentAccepted: true,
          submissionKey: "processing-status-key",
        }),
      }),
    );
    const registration = await registerResponse.json();

    await completeRegistration(
      new Request("http://localhost/api/attendees/register/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          registrationId: registration.registrationId,
          uploadCompletedAt: new Date().toISOString(),
        }),
      }),
    );

    const statusResponse = await getRegistrationStatus(
      new Request(
        `http://localhost/api/attendees/register/status/${registration.registrationId}`,
      ),
      {
        params: Promise.resolve({
          registrationId: registration.registrationId,
        }),
      },
    );
    const status = await statusResponse.json();

    expect(statusResponse.status).toBe(200);
    expect(status).toEqual({
      registrationId: registration.registrationId,
      status: "PROCESSING",
      message: "We are checking your selfie and preparing enrollment.",
    });
  });

  it("returns stable error payloads for invalid registration requests", async () => {
    const missingEventResponse = await createRegistration(
      new Request("http://localhost/api/attendees/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventSlug: "missing-event",
          name: "Jane Doe",
          email: "jane@example.com",
          contentType: "image/jpeg",
          fileName: "selfie.jpg",
          fileSizeBytes: 2048,
          consentAccepted: true,
        }),
      }),
    );

    const invalidNameResponse = await createRegistration(
      new Request("http://localhost/api/attendees/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventSlug: "speaker-session-2026",
          name: "J",
          email: "jane@example.com",
          contentType: "image/jpeg",
          fileName: "selfie.jpg",
          fileSizeBytes: 2048,
          consentAccepted: true,
        }),
      }),
    );

    const unsupportedFileResponse = await createRegistration(
      new Request("http://localhost/api/attendees/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventSlug: "speaker-session-2026",
          name: "Jane Doe",
          email: "jane@example.com",
          contentType: "application/pdf",
          fileName: "selfie.pdf",
          fileSizeBytes: 2048,
          consentAccepted: true,
        }),
      }),
    );

    const malformedJsonResponse = await createRegistration(
      new Request("http://localhost/api/attendees/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{not-valid-json",
      }),
    );

    expect(missingEventResponse.status).toBe(404);
    await expect(missingEventResponse.json()).resolves.toEqual({
      error: {
        code: "INVALID_EVENT",
        message: "This event registration page is not available.",
        correlationId: expect.any(String),
      },
    });

    expect(invalidNameResponse.status).toBe(400);
    await expect(invalidNameResponse.json()).resolves.toEqual({
      error: {
        code: "INVALID_NAME",
        message: "Please enter your full name.",
        field: "name",
        correlationId: expect.any(String),
      },
    });

    expect(unsupportedFileResponse.status).toBe(422);
    await expect(unsupportedFileResponse.json()).resolves.toEqual({
      error: {
        code: "UNSUPPORTED_CONTENT_TYPE",
        message: "Only JPEG, PNG, and WEBP images are supported.",
        field: "selfie",
        correlationId: expect.any(String),
      },
    });

    expect(malformedJsonResponse.status).toBe(400);
    await expect(malformedJsonResponse.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Request body must be a JSON object.",
        correlationId: expect.any(String),
      },
    });
  });

  it("returns 404 for unknown completion and status lookups", async () => {
    const completionResponse = await completeRegistration(
      new Request("http://localhost/api/attendees/register/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          registrationId: "reg_missing",
          uploadCompletedAt: new Date().toISOString(),
        }),
      }),
    );

    const statusResponse = await getRegistrationStatus(
      new Request("http://localhost/api/attendees/register/status/reg_missing"),
      {
        params: Promise.resolve({
          registrationId: "reg_missing",
        }),
      },
    );

    expect(completionResponse.status).toBe(404);
    await expect(completionResponse.json()).resolves.toEqual({
      error: {
        code: "REGISTRATION_NOT_FOUND",
        message: "Registration not found.",
        correlationId: expect.any(String),
      },
    });

    expect(statusResponse.status).toBe(404);
    await expect(statusResponse.json()).resolves.toEqual({
      error: {
        code: "REGISTRATION_NOT_FOUND",
        message: "Registration not found.",
        correlationId: expect.any(String),
      },
    });
  });

  it("treats repeated completion requests as idempotent retries", async () => {
    const registerResponse = await createRegistration(
      new Request("http://localhost/api/attendees/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventSlug: "speaker-session-2026",
          name: "Jane Doe",
          email: "jane@example.com",
          contentType: "image/jpeg",
          fileName: "selfie.jpg",
          fileSizeBytes: 2048,
          consentAccepted: true,
          submissionKey: "repeat-complete-key",
        }),
      }),
    );
    const registration = await registerResponse.json();

    const firstCompletion = await completeRegistration(
      new Request("http://localhost/api/attendees/register/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          registrationId: registration.registrationId,
          uploadCompletedAt: "2026-04-19T10:00:00.000Z",
        }),
      }),
    );
    const secondCompletion = await completeRegistration(
      new Request("http://localhost/api/attendees/register/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          registrationId: registration.registrationId,
          uploadCompletedAt: "2026-04-19T10:05:00.000Z",
        }),
      }),
    );

    expect(firstCompletion.status).toBe(200);
    await expect(firstCompletion.json()).resolves.toEqual({
      registrationId: registration.registrationId,
      status: "PROCESSING",
      message: "We are checking your selfie and preparing enrollment.",
    });

    expect(secondCompletion.status).toBe(200);
    await expect(secondCompletion.json()).resolves.toEqual({
      registrationId: registration.registrationId,
      status: "PROCESSING",
      message: "We are checking your selfie and preparing enrollment.",
    });
  });

  it("returns the same logical registration for repeated submission keys", async () => {
    const firstResponse = await createRegistration(
      new Request("http://localhost/api/attendees/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventSlug: "speaker-session-2026",
          name: "Jane Doe",
          email: "jane@example.com",
          contentType: "image/jpeg",
          fileName: "selfie.jpg",
          fileSizeBytes: 2048,
          consentAccepted: true,
          submissionKey: "same-submission",
        }),
      }),
    );
    const secondResponse = await createRegistration(
      new Request("http://localhost/api/attendees/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventSlug: "speaker-session-2026",
          name: "Jane Doe",
          email: "jane@example.com",
          contentType: "image/png",
          fileName: "other-selfie.png",
          fileSizeBytes: 4096,
          consentAccepted: true,
          submissionKey: "same-submission",
        }),
      }),
    );

    const first = await firstResponse.json();
    const second = await secondResponse.json();

    expect(first.registrationId).toBe(second.registrationId);
    expect(first.attendeeId).toBe(second.attendeeId);
    expect(first.upload.objectKey).toBe(second.upload.objectKey);
  });

  it("returns a placeholder throttling response when rate limiting is forced", async () => {
    const response = await createRegistration(
      new Request("http://localhost/api/attendees/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-facelocator-rate-limit": "always",
        },
        body: JSON.stringify({
          eventSlug: "speaker-session-2026",
          name: "Jane Doe",
          email: "jane@example.com",
          contentType: "image/jpeg",
          fileName: "selfie.jpg",
          fileSizeBytes: 2048,
          consentAccepted: true,
        }),
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("x-correlation-id")).toEqual(expect.any(String));
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many enrollment attempts. Please try again shortly.",
        correlationId: expect.any(String),
      },
    });
  });
});
