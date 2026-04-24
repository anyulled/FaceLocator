import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { getRequiredEnv } = require(
  fileURLToPath(new URL("../../lambdas/matched-photo-notifier/lib.js", import.meta.url)),
);

describe("matched photo notifier helpers", () => {
  it("validates required env and default TTL", () => {
    const env = getRequiredEnv({
      AWS_REGION: "eu-west-1",
      DATABASE_SECRET_NAME: "db-secret",
      SES_FROM_EMAIL: "noreply@example.com",
      MATCH_LINK_SIGNING_SECRET_ARN: "arn:aws:secretsmanager:eu-west-1:123:secret:match",
      FACE_LOCATOR_EVENT_PHOTOS_BUCKET: "event-photos",
    });

    expect(env.linkTtlDays).toBe(30);
    expect(env.databaseSecretName).toBe("db-secret");
  });

  it("throws when required keys are missing", () => {
    expect(() =>
      getRequiredEnv({
        AWS_REGION: "eu-west-1",
      }),
    ).toThrow(/DATABASE_SECRET_NAME/);
  });

  it("keeps the notifier role able to presign matched photo reads", () => {
    const iamTf = readFileSync(
      fileURLToPath(new URL("../../infra/iam.tf", import.meta.url)),
      "utf8",
    );
    const policyStart = iamTf.indexOf(
      'data "aws_iam_policy_document" "matched_photo_notifier_lambda"',
    );
    const policyEnd = iamTf.indexOf(
      'resource "aws_iam_role_policy" "matched_photo_notifier_lambda"',
    );
    const notifierPolicy = iamTf.slice(policyStart, policyEnd);

    expect(notifierPolicy).toContain('sid = "AllowReadMatchedEventPhotoObjects"');
    expect(notifierPolicy).toContain('"s3:GetObject"');
    expect(notifierPolicy).toContain(
      '${aws_s3_bucket.event_photos.arn}/events/matched/*',
    );
  });
});
