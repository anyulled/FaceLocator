import { beforeEach, describe, expect, it } from "vitest";

import { AttendeeApiError } from "@/lib/attendees/errors";
import type { InMemoryEnrollmentStore } from "@/lib/attendees/repository";
import { inMemoryAttendeeRepository } from "@/lib/attendees/repository";
import { mockUploadGateway } from "@/lib/attendees/upload-gateway";

declare global {
  var __faceLocatorEnrollmentStore__: InMemoryEnrollmentStore | undefined;
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

  it("reuses the same registration for repeated submission keys", async () => {
    const first = await inMemoryAttendeeRepository.createRegistrationIntent(
      {
        ...baseRequest,
        submissionKey: "dup-key",
      },
      mockUploadGateway,
    );

    const second = await inMemoryAttendeeRepository.createRegistrationIntent(
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

  it("reuses attendee identity for the same event and email across registrations", async () => {
    const first = await inMemoryAttendeeRepository.createRegistrationIntent(
      {
        ...baseRequest,
        submissionKey: "first-key",
      },
      mockUploadGateway,
    );
    const second = await inMemoryAttendeeRepository.createRegistrationIntent(
      {
        ...baseRequest,
        submissionKey: "second-key",
      },
      mockUploadGateway,
    );

    expect(second.attendeeId).toBe(first.attendeeId);
    expect(second.registrationId).not.toBe(first.registrationId);
  });

  it("transitions processing registrations into enrolled after the delay window", async () => {
    const registration = await inMemoryAttendeeRepository.createRegistrationIntent(
      {
        ...baseRequest,
        submissionKey: "transition-key",
      },
      mockUploadGateway,
    );

    const completion = await inMemoryAttendeeRepository.completeRegistration(
      registration.registrationId,
      new Date(Date.now() - 2000).toISOString(),
    );
    const status = await inMemoryAttendeeRepository.getRegistrationStatus(
      registration.registrationId,
    );

    expect(completion.status).toBe("PROCESSING");
    expect(status).toMatchObject({
      registrationId: registration.registrationId,
      status: "ENROLLED",
    });
  });

  it("treats repeated completion calls as idempotent", async () => {
    const registration = await inMemoryAttendeeRepository.createRegistrationIntent(
      {
        ...baseRequest,
        submissionKey: "complete-twice-key",
      },
      mockUploadGateway,
    );

    const firstCompletion = await inMemoryAttendeeRepository.completeRegistration(
      registration.registrationId,
      "2026-04-19T10:00:00.000Z",
    );
    const secondCompletion = await inMemoryAttendeeRepository.completeRegistration(
      registration.registrationId,
      "2026-04-19T10:05:00.000Z",
    );

    expect(firstCompletion).toEqual({
      registrationId: registration.registrationId,
      status: "PROCESSING",
      message: "We are checking your selfie and preparing enrollment.",
    });
    expect(secondCompletion).toEqual(firstCompletion);
  });

  it("raises typed not-found errors for missing registrations", async () => {
    await expect(
      inMemoryAttendeeRepository.getRegistrationStatus("reg_missing"),
    ).rejects.toThrowError(AttendeeApiError);

    try {
      await inMemoryAttendeeRepository.completeRegistration(
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
