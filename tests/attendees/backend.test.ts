import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createRegistrationIntentMock,
  completeRegistrationMock,
  getRegistrationStatusMock,
  getUploadGatewayMock,
} = vi.hoisted(() => ({
  createRegistrationIntentMock: vi.fn(),
  completeRegistrationMock: vi.fn(),
  getRegistrationStatusMock: vi.fn(),
  getUploadGatewayMock: vi.fn(() => ({ kind: "upload-gateway" })),
}));

vi.mock("@/lib/attendees/runtime", () => ({
  getAttendeeRepository: () => ({
    createRegistrationIntent: createRegistrationIntentMock,
    completeRegistration: completeRegistrationMock,
    getRegistrationStatus: getRegistrationStatusMock,
  }),
  getUploadGateway: getUploadGatewayMock,
}));

describe("attendees backend", () => {
  beforeEach(() => {
    createRegistrationIntentMock.mockReset();
    completeRegistrationMock.mockReset();
    getRegistrationStatusMock.mockReset();
    getUploadGatewayMock.mockClear();
  });

  it("creates registration intents through the direct repository boundary", async () => {
    const intent = {
      registrationId: "r1",
      attendeeId: "a1",
      upload: {
        method: "PUT",
        url: "https://s3/up",
        headers: {},
        objectKey: "key",
        expiresAt: "2026-01-01T11:00:00Z",
      },
      status: "UPLOAD_PENDING",
    };
    createRegistrationIntentMock.mockResolvedValue(intent);

    const { createRegistrationIntentViaBackend } = await import("@/lib/attendees/backend");
    const result = await createRegistrationIntentViaBackend({
      eventSlug: "demo",
      name: "Alice",
      email: "alice@example.com",
      contentType: "image/jpeg",
      fileName: "selfie.jpg",
      fileSizeBytes: 1024,
      consentAccepted: true,
    });

    expect(result).toEqual(intent);
    expect(createRegistrationIntentMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventSlug: "demo", email: "alice@example.com" }),
      { kind: "upload-gateway" },
    );
  });

  it("completes registrations through the direct repository boundary", async () => {
    const response = { registrationId: "r1", attendeeId: "a1", status: "PROCESSING" };
    completeRegistrationMock.mockResolvedValue(response);

    const { completeRegistrationViaBackend } = await import("@/lib/attendees/backend");
    await expect(
      completeRegistrationViaBackend({
        registrationId: "r1",
        uploadCompletedAt: "2026-01-01T12:00:00Z",
      }),
    ).resolves.toEqual(response);
    expect(completeRegistrationMock).toHaveBeenCalledWith("r1", "2026-01-01T12:00:00Z");
  });

  it("reads registration status through the direct repository boundary", async () => {
    const response = { registrationId: "r1", attendeeId: "a1", status: "ENROLLED" };
    getRegistrationStatusMock.mockResolvedValue(response);

    const { getRegistrationStatusViaBackend } = await import("@/lib/attendees/backend");
    await expect(getRegistrationStatusViaBackend("r1")).resolves.toEqual(response);
    expect(getRegistrationStatusMock).toHaveBeenCalledWith("r1");
  });
});
