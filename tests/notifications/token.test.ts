import { beforeEach, describe, expect, it } from "vitest";

import {
  createSignedNotificationToken,
  verifySignedNotificationToken,
} from "@/lib/notifications/token";

describe("notification token signing", () => {
  beforeEach(() => {
    process.env.MATCH_LINK_SIGNING_SECRET = "test-signing-secret";
    process.env.MATCH_LINK_TTL_DAYS = "30";
  });

  it("creates and verifies a valid gallery token", () => {
    const token = createSignedNotificationToken({
      attendeeId: "att_123",
      eventId: "speaker-session-2026",
      faceId: "face_abc",
      action: "gallery",
    });

    const payload = verifySignedNotificationToken(token, "gallery");
    expect(payload).toMatchObject({
      sub: "att_123",
      eventId: "speaker-session-2026",
      faceId: "face_abc",
      action: "gallery",
    });
  });

  it("rejects the same token when action mismatches", () => {
    const token = createSignedNotificationToken({
      attendeeId: "att_123",
      eventId: "speaker-session-2026",
      faceId: "face_abc",
      action: "gallery",
    });

    expect(verifySignedNotificationToken(token, "unsubscribe")).toBeNull();
  });

  it("rejects tampered tokens", () => {
    const token = createSignedNotificationToken({
      attendeeId: "att_123",
      eventId: "speaker-session-2026",
      faceId: "face_abc",
      action: "gallery",
    });

    const [payload, signature] = token.split(".");
    const tampered = `${payload}.${signature?.slice(0, -1)}x`;

    expect(verifySignedNotificationToken(tampered, "gallery")).toBeNull();
  });
});
