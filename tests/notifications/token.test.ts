import { createHmac } from "node:crypto";
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

  it("throws if signing secret is missing", () => {
    delete process.env.MATCH_LINK_SIGNING_SECRET;
    expect(() => createSignedNotificationToken({
      attendeeId: "a", eventId: "e", faceId: "f", action: "gallery"
    })).toThrow("MATCH_LINK_SIGNING_SECRET is required.");
  });

  it("handles fallback TTL when env is invalid", () => {
    process.env.MATCH_LINK_TTL_DAYS = "invalid";
    const token = createSignedNotificationToken({
      attendeeId: "a", eventId: "e", faceId: "f", action: "gallery"
    });
    expect(verifySignedNotificationToken(token, "gallery")).not.toBeNull();
  });

  it("rejects malformed tokens with no dot", () => {
    expect(verifySignedNotificationToken("invalidtoken", "gallery")).toBeNull();
  });

  it("rejects expired tokens", () => {
    const payload = {
      sub: "a", eventId: "e", faceId: "f", action: "gallery", exp: Math.floor(Date.now() / 1000) - 100
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const hmac = createHmac("sha256", "test-signing-secret");
    const sig = hmac.update(encoded).digest("base64url");
    const token = `${encoded}.${sig}`;
    expect(verifySignedNotificationToken(token, "gallery")).toBeNull();
  });

  it("rejects invalid payload types", () => {
    const payload = { sub: 123, eventId: "e", faceId: "f", action: "gallery", exp: Date.now() + 1000 };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const hmac = createHmac("sha256", "test-signing-secret");
    const sig = hmac.update(encoded).digest("base64url");
    const token = `${encoded}.${sig}`;
    expect(verifySignedNotificationToken(token, "gallery")).toBeNull();
  });
});
