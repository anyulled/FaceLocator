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
  });

  it("returns stable error payloads for invalid registration requests", async () => {
    const response = await createRegistration(
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

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_EVENT",
        message: "This event registration page is not available.",
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
      },
    });

    expect(statusResponse.status).toBe(404);
    await expect(statusResponse.json()).resolves.toEqual({
      error: {
        code: "REGISTRATION_NOT_FOUND",
        message: "Registration not found.",
      },
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
});
