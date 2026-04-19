import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  getRequiredEnv,
  parseSelfieRecord,
} = require(fileURLToPath(new URL("../../lambdas/selfie-enrollment/lib.js", import.meta.url)));

describe("selfie enrollment worker helpers", () => {
  it("parses supported selfie S3 records", () => {
    const parsed = parseSelfieRecord({
      s3: {
        bucket: { name: "face-locator-poc-selfies" },
        object: { key: "events/speaker-session/attendees/att_123/selfie.jpg" },
      },
    });

    expect(parsed).toEqual({
      bucket: "face-locator-poc-selfies",
      key: "events/speaker-session/attendees/att_123/selfie.jpg",
      eventId: "speaker-session",
      attendeeId: "att_123",
      fileName: "selfie.jpg",
    });
  });

  it("rejects unsupported selfie keys", () => {
    expect(
      parseSelfieRecord({
        s3: {
          bucket: { name: "bucket" },
          object: { key: "events/pending/speaker-session/photos/photo.jpg" },
        },
      }),
    ).toBeNull();
  });

  it("requires the Lambda environment contract", () => {
    expect(() =>
      getRequiredEnv({
        AWS_REGION: "eu-west-1",
      }),
    ).toThrow(/SELFIES_BUCKET_NAME/);
  });
});
