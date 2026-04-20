import { beforeEach, describe, expect, it, vi } from "vitest";

const getSignedUrlMock = vi.fn();

vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: class PutObjectCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  },
  S3Client: class S3Client {
    config: unknown;

    constructor(config: unknown) {
      this.config = config;
    }
  },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

import { AWS_POC_CONSENT_TEXT_VERSION } from "@/lib/aws/boundary";
import {
  createUploadGatewayFromEnv,
  mockUploadGateway,
} from "@/lib/attendees/upload-gateway";

describe("mock upload gateway", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.FACE_LOCATOR_AWS_UPLOAD_MODE;
    delete process.env.FACE_LOCATOR_SELFIES_BUCKET;
    delete process.env.AWS_REGION;
    getSignedUrlMock.mockReset();
  });

  it("creates deterministic upload instructions from the boundary input", async () => {
    const instructions = await mockUploadGateway.createUploadInstructions({
      registrationId: "reg_123",
      attendeeId: "att_123",
      eventSlug: "speaker-session-2026",
      fileName: "My Selfie.JPG",
      contentType: "image/jpeg",
    });

    expect(instructions).toMatchObject({
      method: "PUT",
      url: "mock://upload/reg_123",
      headers: {
        "Content-Type": "image/jpeg",
      },
      objectKey: "events/speaker-session-2026/attendees/att_123/my-selfie.jpg",
    });
    expect(Date.parse(instructions.expiresAt)).not.toBeNaN();
  });

  it("encodes the required object metadata into the presigned upload contract", async () => {
    process.env.FACE_LOCATOR_AWS_UPLOAD_MODE = "aws";
    process.env.FACE_LOCATOR_SELFIES_BUCKET = "selfies-bucket";
    process.env.AWS_REGION = "us-east-1";
    getSignedUrlMock.mockResolvedValue(
      "https://signed.example.test/upload?x-amz-meta-attendee-id=att_123&x-amz-meta-consent-version=2026-04-19&x-amz-meta-event-id=speaker-session-2026&x-amz-meta-registration-id=reg_123",
    );

    const gateway = createUploadGatewayFromEnv();
    const instructions = await gateway.createUploadInstructions({
      registrationId: "reg_123",
      attendeeId: "att_123",
      eventSlug: "speaker-session-2026",
      fileName: "My Selfie.JPG",
      contentType: "image/jpeg",
    });

    expect(instructions).toMatchObject({
      method: "PUT",
      url: expect.stringContaining("https://signed.example.test/upload"),
      headers: {
        "Content-Type": "image/jpeg",
      },
      objectKey: "events/speaker-session-2026/attendees/att_123/my-selfie.jpg",
    });
    expect(instructions.url).toContain("x-amz-meta-attendee-id=att_123");
    expect(instructions.url).toContain(
      `x-amz-meta-consent-version=${AWS_POC_CONSENT_TEXT_VERSION}`,
    );
    expect(instructions.url).toContain("x-amz-meta-event-id=speaker-session-2026");
    expect(instructions.url).toContain("x-amz-meta-registration-id=reg_123");

    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
  });
});
