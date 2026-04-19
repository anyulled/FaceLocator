import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  completeRegistration,
  createRegistrationIntent,
  getRegistrationStatus,
  uploadSelfie,
} from "@/lib/attendees/client";

describe("attendee client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("posts registration payloads to the same-origin route", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          registrationId: "reg_123",
          attendeeId: "att_123",
          upload: {
            method: "PUT",
            url: "mock://upload/reg_123",
            headers: { "Content-Type": "image/jpeg" },
            objectKey: "events/speaker-session-2026/attendees/att_123/selfie.jpg",
            expiresAt: new Date().toISOString(),
          },
          status: "UPLOAD_PENDING",
        }),
        { status: 200 },
      ),
    );

    await createRegistrationIntent({
      eventSlug: "speaker-session-2026",
      name: "Jane Doe",
      email: "jane@example.com",
      contentType: "image/jpeg",
      fileName: "selfie.jpg",
      fileSizeBytes: 1024,
      consentAccepted: true,
      submissionKey: "client-key",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/attendees/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: expect.any(String),
    });
  });

  it("surfaces JSON error payloads from route failures", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "INVALID_EMAIL",
            message: "Email address is invalid.",
            field: "email",
          },
        }),
        { status: 400 },
      ),
    );

    await expect(
      createRegistrationIntent({
        eventSlug: "speaker-session-2026",
        name: "Jane Doe",
        email: "bad-email",
        contentType: "image/jpeg",
        fileName: "selfie.jpg",
        fileSizeBytes: 1024,
        consentAccepted: true,
      }),
    ).rejects.toMatchObject({
      error: {
        code: "INVALID_EMAIL",
      },
    });
  });

  it("supports mock uploads without a network call", async () => {
    await uploadSelfie(
      {
        method: "PUT",
        url: "mock://upload/reg_123",
        headers: { "Content-Type": "image/jpeg" },
        objectKey: "events/speaker-session-2026/attendees/att_123/selfie.jpg",
        expiresAt: new Date().toISOString(),
      },
      new File(["binary"], "selfie.jpg", { type: "image/jpeg" }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws a stable error payload when a direct upload fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    await expect(
      uploadSelfie(
        {
          method: "PUT",
          url: "https://uploads.example.test/object",
          headers: { "Content-Type": "image/jpeg" },
          objectKey: "events/speaker-session-2026/attendees/att_123/selfie.jpg",
          expiresAt: new Date().toISOString(),
        },
        new File(["binary"], "selfie.jpg", { type: "image/jpeg" }),
      ),
    ).rejects.toMatchObject({
      error: {
        code: "INTERNAL_ERROR",
        message: "Selfie upload failed.",
      },
    });
  });

  it("uses the same-origin completion and status routes", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            registrationId: "reg_123",
            status: "PROCESSING",
            message: "Your selfie is being processed now.",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            registrationId: "reg_123",
            status: "ENROLLED",
            message: "Your selfie has been registered.",
          }),
          { status: 200 },
        ),
      );

    await completeRegistration({
      registrationId: "reg_123",
      uploadCompletedAt: new Date().toISOString(),
    });
    await getRegistrationStatus("reg_123");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/attendees/register/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: expect.any(String),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/attendees/register/status/reg_123", {
      method: "GET",
    });
  });
});
