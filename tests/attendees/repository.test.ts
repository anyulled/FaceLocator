import { beforeEach, describe, expect, it } from "vitest";

import { AttendeeApiError } from "@/lib/attendees/errors";
import { inMemoryAttendeeRepository } from "@/lib/attendees/repository";
import { mockUploadGateway } from "@/lib/attendees/upload-gateway";

declare global {
  var __faceLocatorEnrollmentStore__: unknown;
}

const baseRequest = {
  eventSlug: "speaker-session-2026",
  name: "Jane Doe",
  email: "jane@example.com",
  contentType: "image/jpeg",
  fileName: "Selfie Shot.JPG",
  fileSizeBytes: 1024,
  consentAccepted: true,
};

describe("attendee repository", () => {
  beforeEach(() => {
    globalThis.__faceLocatorEnrollmentStore__ = undefined;
  });

  it("reuses the same registration for repeated submission keys", () => {
    const first = inMemoryAttendeeRepository.createRegistrationIntent(
      {
        ...baseRequest,
        submissionKey: "dup-key",
      },
      mockUploadGateway,
    );

    const second = inMemoryAttendeeRepository.createRegistrationIntent(
      {
        ...baseRequest,
        fileName: "other-name.png",
        contentType: "image/png",
        submissionKey: "dup-key",
      },
      mockUploadGateway,
    );

    expect(second).toEqual(first);
  });

  it("reuses attendee identity for the same event and email across registrations", () => {
    const first = inMemoryAttendeeRepository.createRegistrationIntent(
      {
        ...baseRequest,
        submissionKey: "first-key",
      },
      mockUploadGateway,
    );
    const second = inMemoryAttendeeRepository.createRegistrationIntent(
      {
        ...baseRequest,
        submissionKey: "second-key",
      },
      mockUploadGateway,
    );

    expect(second.attendeeId).toBe(first.attendeeId);
    expect(second.registrationId).not.toBe(first.registrationId);
  });

  it("transitions processing registrations into enrolled after the delay window", () => {
    const registration = inMemoryAttendeeRepository.createRegistrationIntent(
      {
        ...baseRequest,
        submissionKey: "transition-key",
      },
      mockUploadGateway,
    );

    const completion = inMemoryAttendeeRepository.completeRegistration(
      registration.registrationId,
      new Date(Date.now() - 2000).toISOString(),
    );
    const status = inMemoryAttendeeRepository.getRegistrationStatus(
      registration.registrationId,
    );

    expect(completion.status).toBe("PROCESSING");
    expect(status).toMatchObject({
      registrationId: registration.registrationId,
      status: "ENROLLED",
    });
  });

  it("treats repeated completion calls as idempotent", () => {
    const registration = inMemoryAttendeeRepository.createRegistrationIntent(
      {
        ...baseRequest,
        submissionKey: "complete-twice-key",
      },
      mockUploadGateway,
    );

    const firstCompletion = inMemoryAttendeeRepository.completeRegistration(
      registration.registrationId,
      "2026-04-19T10:00:00.000Z",
    );
    const secondCompletion = inMemoryAttendeeRepository.completeRegistration(
      registration.registrationId,
      "2026-04-19T10:05:00.000Z",
    );

    expect(firstCompletion).toEqual({
      registrationId: registration.registrationId,
      status: "PROCESSING",
      message: "Your selfie is being processed now.",
    });
    expect(secondCompletion).toEqual(firstCompletion);
  });

  it("raises typed not-found errors for missing registrations", () => {
    expect(() =>
      inMemoryAttendeeRepository.getRegistrationStatus("reg_missing"),
    ).toThrowError(AttendeeApiError);

    try {
      inMemoryAttendeeRepository.completeRegistration(
        "reg_missing",
        new Date().toISOString(),
      );
    } catch (error) {
      expect(error).toMatchObject({
        status: 404,
        code: "REGISTRATION_NOT_FOUND",
      });
    }
  });
});
