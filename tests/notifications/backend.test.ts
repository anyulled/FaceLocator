import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications/gallery", () => ({
  getMatchedGalleryData: vi.fn(),
  unsubscribeFromMatchedPhotoNotifications: vi.fn(),
}));

vi.mock("@/lib/notifications/token", () => ({
  verifySignedNotificationToken: vi.fn(),
}));

import {
  getMatchedGalleryData,
  unsubscribeFromMatchedPhotoNotifications,
} from "@/lib/notifications/gallery";
import { verifySignedNotificationToken } from "@/lib/notifications/token";

const mockedGetGallery = vi.mocked(getMatchedGalleryData);
const mockedUnsubscribe = vi.mocked(unsubscribeFromMatchedPhotoNotifications);
const mockedVerifyToken = vi.mocked(verifySignedNotificationToken);

describe("notifications backend", () => {
  beforeEach(() => {
    mockedGetGallery.mockReset();
    mockedUnsubscribe.mockReset();
    mockedVerifyToken.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns gallery data when the signed token matches the request", async () => {
    mockedVerifyToken.mockReturnValue({
      sub: "attendee-1",
      eventId: "event-1",
      faceId: "face-1",
      action: "gallery",
      exp: 0,
    });
    mockedGetGallery.mockResolvedValue({
      attendeeName: "Alice",
      photoUrls: ["https://cdn/photo.jpg"],
    });

    const { getMatchedGalleryDataViaBackend } = await import("@/lib/notifications/backend");
    await expect(
      getMatchedGalleryDataViaBackend({
        eventId: "event-1",
        faceId: "face-1",
        token: "valid-token",
      }),
    ).resolves.toEqual({
      attendeeName: "Alice",
      photoUrls: ["https://cdn/photo.jpg"],
    });
  });

  it("returns null when the gallery token is invalid or mismatched", async () => {
    mockedVerifyToken.mockReturnValue(null);

    const { getMatchedGalleryDataViaBackend } = await import("@/lib/notifications/backend");
    await expect(
      getMatchedGalleryDataViaBackend({
        eventId: "event-1",
        faceId: "face-1",
        token: "bad-token",
      }),
    ).resolves.toBeNull();

    mockedVerifyToken.mockReturnValue({
      sub: "attendee-1",
      eventId: "other-event",
      faceId: "face-1",
      action: "gallery",
      exp: 0,
    });

    await expect(
      getMatchedGalleryDataViaBackend({
        eventId: "event-1",
        faceId: "face-1",
        token: "wrong-event",
      }),
    ).resolves.toBeNull();
  });

  it("returns null and logs when the gallery lookup fails", async () => {
    mockedVerifyToken.mockReturnValue({
      sub: "attendee-1",
      eventId: "event-1",
      faceId: "face-1",
      action: "gallery",
      exp: 0,
    });
    mockedGetGallery.mockRejectedValue(new Error("DB error"));

    const { getMatchedGalleryDataViaBackend } = await import("@/lib/notifications/backend");
    await expect(
      getMatchedGalleryDataViaBackend({
        eventId: "event-1",
        faceId: "face-1",
        token: "valid-token",
      }),
    ).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("returns true when unsubscribe succeeds", async () => {
    mockedVerifyToken.mockReturnValue({
      sub: "attendee-1",
      eventId: "event-1",
      faceId: "face-1",
      action: "unsubscribe",
      exp: 0,
    });
    mockedUnsubscribe.mockResolvedValue(undefined);

    const { unsubscribeFromMatchedPhotoNotificationsViaBackend } = await import(
      "@/lib/notifications/backend"
    );
    await expect(
      unsubscribeFromMatchedPhotoNotificationsViaBackend({
        eventId: "event-1",
        faceId: "face-1",
        token: "valid-token",
      }),
    ).resolves.toBe(true);
  });

  it("returns false when unsubscribe token validation fails", async () => {
    mockedVerifyToken.mockReturnValue(null);

    const { unsubscribeFromMatchedPhotoNotificationsViaBackend } = await import(
      "@/lib/notifications/backend"
    );
    await expect(
      unsubscribeFromMatchedPhotoNotificationsViaBackend({
        eventId: "event-1",
        faceId: "face-1",
        token: "bad-token",
      }),
    ).resolves.toBe(false);
  });

  it("returns false and logs when unsubscribe fails", async () => {
    mockedVerifyToken.mockReturnValue({
      sub: "attendee-1",
      eventId: "event-1",
      faceId: "face-1",
      action: "unsubscribe",
      exp: 0,
    });
    mockedUnsubscribe.mockRejectedValue(new Error("DB gone"));

    const { unsubscribeFromMatchedPhotoNotificationsViaBackend } = await import(
      "@/lib/notifications/backend"
    );
    await expect(
      unsubscribeFromMatchedPhotoNotificationsViaBackend({
        eventId: "event-1",
        faceId: "face-1",
        token: "valid-token",
      }),
    ).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
