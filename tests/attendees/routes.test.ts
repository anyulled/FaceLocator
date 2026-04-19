import { describe, expect, it } from "vitest";

import { POST as completeRegistration } from "@/app/api/attendees/register/complete/route";
import { POST as createRegistration } from "@/app/api/attendees/register/route";
import { GET as getRegistrationStatus } from "@/app/api/attendees/register/status/[registrationId]/route";

describe("attendee route handlers", () => {
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
});
