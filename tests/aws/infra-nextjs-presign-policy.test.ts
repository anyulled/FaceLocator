import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const iamTf = readFileSync(
  fileURLToPath(new URL("../../infra/iam.tf", import.meta.url)),
  "utf8",
);

describe("nextjs presign iam policy", () => {
  it("allows logo uploads for admin create-event path", () => {
    expect(iamTf).toContain('sid = "AllowEventLogoUploads"');
    expect(iamTf).toContain('"${aws_s3_bucket.event_logos.arn}/events/*/logos/*"');
    expect(iamTf).toContain('"${aws_s3_bucket.event_photos.arn}/events/*/logos/*"');
    expect(iamTf).toContain('"s3:PutObject"');
    expect(iamTf).toContain('"s3:PutObjectTagging"');
  });
});
