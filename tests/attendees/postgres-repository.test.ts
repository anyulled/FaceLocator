import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockRelease = vi.fn();
const mockGateway = {
  createUploadInstructions: vi.fn(),
};

vi.mock("@/lib/aws/database", () => ({
  getDatabasePool: vi.fn(async () => ({
    query: mockQuery,
    connect: mockConnect,
  })),
}));

import { postgresAttendeeRepository } from "@/lib/attendees/postgres-repository";

const baseRequest = {
  eventSlug: "speaker-session-2026",
  name: "Jane Doe",
  email: "jane@example.com",
  contentType: "image/jpeg",
  fileName: "Selfie Shot.JPG",
  fileSizeBytes: 1024,
  consentAccepted: true,
  submissionKey: "dup-key",
};

describe("postgres attendee repository", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockConnect.mockReset();
    mockRelease.mockReset();
    mockGateway.createUploadInstructions.mockReset();

    mockConnect.mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    });
  });

  it("reuses an existing registration for repeated submission keys and refreshes upload instructions", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            registrationId: "reg_existing",
            attendeeId: "att_existing",
            selfieObjectKey:
              "events/speaker-session-2026/attendees/att_existing/original-selfie.jpg",
            status: "pending",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    mockGateway.createUploadInstructions.mockResolvedValue({
      method: "PUT",
      url: "https://signed.example.test/reused",
      headers: { "Content-Type": "image/jpeg" },
      objectKey:
        "events/speaker-session-2026/attendees/att_existing/original-selfie.jpg",
      expiresAt: "2026-04-20T10:10:00.000Z",
    });

    const response = await postgresAttendeeRepository.createRegistrationIntent(
      {
        ...baseRequest,
        fileName: "new-name.jpg",
      },
      mockGateway,
    );

    expect(response).toMatchObject({
      registrationId: "reg_existing",
      attendeeId: "att_existing",
      status: "UPLOAD_PENDING",
      upload: {
        url: "https://signed.example.test/reused",
      },
    });
    expect(mockGateway.createUploadInstructions).toHaveBeenCalledWith({
      registrationId: "reg_existing",
      attendeeId: "att_existing",
      eventSlug: "speaker-session-2026",
      fileName: "original-selfie.jpg",
      contentType: "image/jpeg",
    });
  });

  it("persists new registration intent state and transitions completion/status lookups", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // existing lookup
      .mockResolvedValueOnce({ rows: [] }) // upsert event
      .mockResolvedValueOnce({ rows: [] }) // attendee lookup
      .mockResolvedValueOnce({ rows: [] }) // insert attendee
      .mockResolvedValueOnce({ rows: [] }) // insert consent
      .mockResolvedValueOnce({ rows: [] }) // upsert event_attendees
      .mockResolvedValueOnce({ rows: [] }) // insert face_enrollments
      .mockResolvedValueOnce({ rows: [] }) // COMMIT
      .mockResolvedValueOnce({
        rows: [{ eventId: "speaker-session-2026", attendeeId: "att_created" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: "processing" }] });

    mockGateway.createUploadInstructions.mockResolvedValue({
      method: "PUT",
      url: "https://signed.example.test/new",
      headers: { "Content-Type": "image/jpeg" },
      objectKey: "events/speaker-session-2026/attendees/att_created/selfie-shot.jpg",
      expiresAt: "2026-04-20T10:10:00.000Z",
    });

    const created = await postgresAttendeeRepository.createRegistrationIntent(
      baseRequest,
      mockGateway,
    );
    const completion = await postgresAttendeeRepository.completeRegistration(
      created.registrationId,
      "2026-04-20T10:00:00.000Z",
    );
    const status = await postgresAttendeeRepository.getRegistrationStatus(
      created.registrationId,
    );

    expect(created.status).toBe("UPLOAD_PENDING");
    expect(completion).toEqual({
      registrationId: created.registrationId,
      status: "PROCESSING",
      message: "We are checking your selfie and preparing enrollment.",
    });
    expect(status).toEqual(completion);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});
