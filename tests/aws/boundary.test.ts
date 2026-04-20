import { describe, expect, it } from "vitest";

import {
  AWS_POC_CONSENT_TEXT_VERSION,
  AWS_POC_MINIMUM_CONSENT_TEXT,
  buildEventPhotoPendingObjectKey,
  buildSelfieObjectKey,
  EVENT_PHOTO_UPLOAD_METADATA_FIELDS,
  NEXTJS_AWS_ENV_VARS,
  parseEventPhotoPendingObjectKey,
  parseSelfieObjectKey,
  SELFIE_UPLOAD_METADATA_FIELDS,
} from "@/lib/aws/boundary";

describe("aws boundary helpers", () => {
  it("builds and parses selfie object keys deterministically", () => {
    const key = buildSelfieObjectKey({
      eventId: "Speaker Session 2026",
      attendeeId: "ATT_123",
      fileName: "My Selfie.JPG",
    });

    expect(key).toBe("events/speaker-session-2026/attendees/att_123/my-selfie.jpg");
    expect(parseSelfieObjectKey(key)).toEqual({
      eventId: "speaker-session-2026",
      attendeeId: "att_123",
      fileName: "my-selfie.jpg",
    });
  });

  it("builds and parses pending event photo keys", () => {
    const key = buildEventPhotoPendingObjectKey({
      eventId: "Summit 2026",
      photoId: "IMG_4000",
      extension: ".PNG",
    });

    expect(key).toBe("events/pending/summit-2026/photos/img_4000.png");
    expect(parseEventPhotoPendingObjectKey(key)).toEqual({
      eventId: "summit-2026",
      fileName: "img_4000.png",
    });
  });

  it("publishes the expected metadata and environment contracts", () => {
    expect(SELFIE_UPLOAD_METADATA_FIELDS).toEqual([
      "event-id",
      "attendee-id",
      "registration-id",
      "consent-version",
    ]);
    expect(EVENT_PHOTO_UPLOAD_METADATA_FIELDS).toEqual([
      "event-id",
      "photo-id",
      "uploaded-by",
    ]);
    expect(NEXTJS_AWS_ENV_VARS).toContain("FACE_LOCATOR_DATABASE_SECRET_NAME");
    expect(NEXTJS_AWS_ENV_VARS).toContain("DATABASE_SECRET_NAME");
    expect(NEXTJS_AWS_ENV_VARS).toContain("FACE_LOCATOR_SELFIES_BUCKET");
    expect(NEXTJS_AWS_ENV_VARS).toContain("MATCH_LINK_SIGNING_SECRET");
    expect(NEXTJS_AWS_ENV_VARS).toContain("SES_FROM_EMAIL");
    expect(AWS_POC_CONSENT_TEXT_VERSION).toBe("2026-04-19");
    expect(AWS_POC_MINIMUM_CONSENT_TEXT).toContain("facial matching");
  });
});
