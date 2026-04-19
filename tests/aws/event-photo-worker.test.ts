import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  getRequiredEnv,
  parseEventPhotoRecord,
} = require(fileURLToPath(new URL("../../lambdas/event-photo-worker/lib.js", import.meta.url)));

describe("event photo worker helpers", () => {
  it("parses pending event photo records", () => {
    const parsed = parseEventPhotoRecord({
      s3: {
        bucket: { name: "face-locator-poc-event-photos" },
        object: { key: "events/pending/speaker-session/photos/photo-001.jpg" },
      },
    });

    expect(parsed).toEqual({
      bucket: "face-locator-poc-event-photos",
      key: "events/pending/speaker-session/photos/photo-001.jpg",
      eventId: "speaker-session",
      fileName: "photo-001.jpg",
    });
  });

  it("rejects unsupported event photo keys", () => {
    expect(
      parseEventPhotoRecord({
        s3: {
          bucket: { name: "bucket" },
          object: { key: "events/speaker-session/attendees/att_123/selfie.jpg" },
        },
      }),
    ).toBeNull();
  });

  it("requires the Lambda environment contract", () => {
    expect(() =>
      getRequiredEnv({
        AWS_REGION: "eu-west-1",
      }),
    ).toThrow(/EVENT_PHOTOS_BUCKET_NAME/);
  });
});
