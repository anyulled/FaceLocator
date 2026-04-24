import { beforeEach, describe, expect, it, vi } from "vitest";

const getSignedUrlMock = vi.fn();
const queryMock = vi.fn();

vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: class GetObjectCommand {
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

vi.mock("@/lib/aws/database", () => ({
  getDatabasePool: async () => ({
    query: (...args: unknown[]) => queryMock(...args),
  }),
}));

import { getMatchedGalleryData } from "@/lib/notifications/gallery";

describe("matched gallery data", () => {
  beforeEach(() => {
    getSignedUrlMock.mockReset();
    queryMock.mockReset();
    process.env.AWS_REGION = "eu-west-1";
    process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET = "face-locator-poc-event-photos";
  });

  it("forces image content type on presigned gallery URLs", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ attendeeName: "Raquel Campomás" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            objectKey: "events/matched/cantus-laudis-2026/photos/photo-1.jpg",
          },
        ],
      });
    getSignedUrlMock.mockResolvedValue("https://signed.example.test/photo.jpg");

    const result = await getMatchedGalleryData({
      eventId: "cantus-laudis-2026",
      attendeeId: "att_123",
      faceId: "face_123",
    });

    expect(result).toEqual({
      attendeeName: "Raquel Campomás",
      photoUrls: ["https://signed.example.test/photo.jpg"],
    });

    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    const command = getSignedUrlMock.mock.calls[0]?.[1] as { input?: { ResponseContentType?: string } };
    expect(command.input?.ResponseContentType).toBe("image/jpeg");
  });
});
