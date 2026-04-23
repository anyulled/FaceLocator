import { createRequire } from "node:module";
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
});
