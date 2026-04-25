import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("@aws-sdk/client-lambda", () => ({
  InvokeCommand: class {
    constructor(public readonly input: unknown) {}
  },
  LambdaClient: class {
    constructor(public readonly config: unknown) {}
    send = sendMock;
  },
}));

vi.mock("@/lib/notifications/gallery", () => ({
  getMatchedGalleryData: vi.fn(),
  unsubscribeFromMatchedPhotoNotifications: vi.fn(),
}));

vi.mock("@/lib/notifications/token", () => ({
  verifySignedNotificationToken: vi.fn(),
}));

import { getMatchedGalleryData, unsubscribeFromMatchedPhotoNotifications } from "@/lib/notifications/gallery";
import { verifySignedNotificationToken } from "@/lib/notifications/token";

const mockedGetGallery = vi.mocked(getMatchedGalleryData);
const mockedUnsubscribe = vi.mocked(unsubscribeFromMatchedPhotoNotifications);
const mockedVerifyToken = vi.mocked(verifySignedNotificationToken);

function encodePayload(v: unknown) {
  return Buffer.from(JSON.stringify(v), "utf8");
}

describe("notifications backend — mode resolution", () => {
  afterEach(() => {
    delete process.env.MATCH_LINK_BACKEND;
    delete process.env.FACE_LOCATOR_REPOSITORY_TYPE;
    delete process.env.FACE_LOCATOR_MATCH_LINK_BACKEND;
    delete process.env.FACE_LOCATOR_MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME;
    delete process.env.MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME;
  });

  it("returns direct mode by default in non-production", async () => {
    const { getMatchedPhotoBackendMode } = await import("@/lib/notifications/backend");
    expect(getMatchedPhotoBackendMode()).toBe("direct");
  });

  it("returns lambda mode when MATCH_LINK_BACKEND=lambda", async () => {
    process.env.MATCH_LINK_BACKEND = "lambda";
    const { getMatchedPhotoBackendMode } = await import("@/lib/notifications/backend");
    expect(getMatchedPhotoBackendMode()).toBe("lambda");
  });

  it("returns direct mode when MATCH_LINK_BACKEND=direct", async () => {
    process.env.MATCH_LINK_BACKEND = "direct";
    const { getMatchedPhotoBackendMode } = await import("@/lib/notifications/backend");
    expect(getMatchedPhotoBackendMode()).toBe("direct");
  });

  it("falls back to default notifier lambda name", async () => {
    const { getMatchedPhotoNotifierLambdaName } = await import("@/lib/notifications/backend");
    expect(getMatchedPhotoNotifierLambdaName()).toBe("face-locator-poc-matched-photo-notifier");
  });

  it("reads FACE_LOCATOR_MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME", async () => {
    process.env.FACE_LOCATOR_MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME = "my-notifier";
    const { getMatchedPhotoNotifierLambdaName } = await import("@/lib/notifications/backend");
    expect(getMatchedPhotoNotifierLambdaName()).toBe("my-notifier");
  });

  it("reads MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME as fallback", async () => {
    process.env.MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME = "fallback-notifier";
    const { getMatchedPhotoNotifierLambdaName } = await import("@/lib/notifications/backend");
    expect(getMatchedPhotoNotifierLambdaName()).toBe("fallback-notifier");
  });
});

describe("getMatchedGalleryDataViaBackend — direct mode", () => {
  beforeEach(() => {
    delete process.env.MATCH_LINK_BACKEND;
    delete process.env.FACE_LOCATOR_REPOSITORY_TYPE;
    sendMock.mockReset();
    mockedGetGallery.mockReset();
    mockedVerifyToken.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns gallery data when token is valid", async () => {
    mockedVerifyToken.mockReturnValue({ sub: "attendee-1", eventId: "event-1", faceId: "face-1", purpose: "gallery" });
    mockedGetGallery.mockResolvedValue({ attendeeName: "Alice", photoUrls: ["https://cdn/photo.jpg"] });

    const { getMatchedGalleryDataViaBackend } = await import("@/lib/notifications/backend");
    const result = await getMatchedGalleryDataViaBackend({
      eventId: "event-1",
      faceId: "face-1",
      token: "valid-token",
    });
    expect(result).toMatchObject({ attendeeName: "Alice" });
  });

  it("returns null when token is invalid", async () => {
    mockedVerifyToken.mockReturnValue(null);

    const { getMatchedGalleryDataViaBackend } = await import("@/lib/notifications/backend");
    const result = await getMatchedGalleryDataViaBackend({
      eventId: "event-1",
      faceId: "face-1",
      token: "bad",
    });
    expect(result).toBeNull();
  });

  it("returns null when token eventId doesn't match", async () => {
    mockedVerifyToken.mockReturnValue({ sub: "a1", eventId: "other-event", faceId: "face-1", purpose: "gallery" });

    const { getMatchedGalleryDataViaBackend } = await import("@/lib/notifications/backend");
    const result = await getMatchedGalleryDataViaBackend({
      eventId: "event-1",
      faceId: "face-1",
      token: "valid",
    });
    expect(result).toBeNull();
  });

  it("returns null and logs on gallery error", async () => {
    mockedVerifyToken.mockReturnValue({ sub: "a1", eventId: "event-1", faceId: "face-1", purpose: "gallery" });
    mockedGetGallery.mockRejectedValue(new Error("DB error"));

    const { getMatchedGalleryDataViaBackend } = await import("@/lib/notifications/backend");
    const result = await getMatchedGalleryDataViaBackend({ eventId: "event-1", faceId: "face-1", token: "t" });
    expect(result).toBeNull();
  });
});

describe("unsubscribeFromMatchedPhotoNotificationsViaBackend — direct mode", () => {
  beforeEach(() => {
    delete process.env.MATCH_LINK_BACKEND;
    sendMock.mockReset();
    mockedUnsubscribe.mockReset();
    mockedVerifyToken.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns true on successful unsubscribe", async () => {
    mockedVerifyToken.mockReturnValue({ sub: "a1", eventId: "e1", faceId: "f1", purpose: "unsubscribe" });
    mockedUnsubscribe.mockResolvedValue(undefined);

    const { unsubscribeFromMatchedPhotoNotificationsViaBackend } = await import("@/lib/notifications/backend");
    const result = await unsubscribeFromMatchedPhotoNotificationsViaBackend({ eventId: "e1", faceId: "f1", token: "t" });
    expect(result).toBe(true);
  });

  it("returns false when token is null", async () => {
    mockedVerifyToken.mockReturnValue(null);

    const { unsubscribeFromMatchedPhotoNotificationsViaBackend } = await import("@/lib/notifications/backend");
    const result = await unsubscribeFromMatchedPhotoNotificationsViaBackend({ eventId: "e1", faceId: "f1", token: "bad" });
    expect(result).toBe(false);
  });

  it("returns false and logs on error", async () => {
    mockedVerifyToken.mockReturnValue({ sub: "a1", eventId: "e1", faceId: "f1", purpose: "unsubscribe" });
    mockedUnsubscribe.mockRejectedValue(new Error("DB gone"));

    const { unsubscribeFromMatchedPhotoNotificationsViaBackend } = await import("@/lib/notifications/backend");
    const result = await unsubscribeFromMatchedPhotoNotificationsViaBackend({ eventId: "e1", faceId: "f1", token: "t" });
    expect(result).toBe(false);
  });
});

describe("unsubscribeFromMatchedPhotoNotificationsViaBackend — lambda mode", () => {
  beforeEach(() => {
    process.env.MATCH_LINK_BACKEND = "lambda";
    sendMock.mockReset();
  });

  afterEach(() => {
    delete process.env.MATCH_LINK_BACKEND;
  });

  it("returns true when lambda reports unsubscribed=true", async () => {
    sendMock.mockResolvedValue({ Payload: encodePayload({ unsubscribed: true }) });

    const { unsubscribeFromMatchedPhotoNotificationsViaBackend } = await import("@/lib/notifications/backend");
    const result = await unsubscribeFromMatchedPhotoNotificationsViaBackend({ eventId: "e1", faceId: "f1", token: "t" });
    expect(result).toBe(true);
  });

  it("returns false when lambda returns null payload", async () => {
    sendMock.mockResolvedValue({ Payload: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { unsubscribeFromMatchedPhotoNotificationsViaBackend } = await import("@/lib/notifications/backend");
    const result = await unsubscribeFromMatchedPhotoNotificationsViaBackend({ eventId: "e1", faceId: "f1", token: "t" });
    expect(result).toBe(false);
  });
});
