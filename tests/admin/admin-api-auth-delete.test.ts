import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as listEvents } from "@/app/api/admin/events/route";
import { POST as createEvent } from "@/app/api/admin/events/route";
import { GET as listEventPhotos } from "@/app/api/admin/events/[eventSlug]/photos/route";
import { POST as presignPhotoUpload } from "@/app/api/admin/events/[eventSlug]/photos/presign/route";
import { POST as reprocessPhotos } from "@/app/api/admin/events/[eventSlug]/photos/reprocess/route";
import { POST as notifyPhotoMatch } from "@/app/api/admin/events/[eventSlug]/photos/notify/route";
import { POST as deletePhotosBatch } from "@/app/api/admin/events/[eventSlug]/photos/delete/route";
import { DELETE as deleteSinglePhoto } from "@/app/api/admin/events/[eventSlug]/photos/[photoId]/route";
import {
  createAdminEventPhotoUpload,
  deleteAdminEventPhoto,
  deleteAdminEventPhotosBatch,
} from "@/lib/admin/events/repository";
import {
  createAdminEventViaBackend,
  getAdminEventPhotosPageViaBackend,
  listAdminEventsViaBackend,
  createAdminEventPhotoUploadViaBackend,
  reprocessAdminEventPhotosViaBackend,
  sendMatchedPhotoNotificationViaBackend,
} from "@/lib/admin/events/backend";
import { isAuthorizedAdminRequest, resolveAdminIdentity } from "@/lib/admin/auth";

vi.mock("@/lib/admin/auth", () => ({
  extractRequestId: vi.fn(() => "request-id-1"),
  isAuthorizedAdminRequest: vi.fn(),
  resolveAdminIdentity: vi.fn(),
}));

vi.mock("@/lib/admin/events/backend", () => ({
  listAdminEventsViaBackend: vi.fn(),
  createAdminEventViaBackend: vi.fn(),
  getAdminEventPhotosPageViaBackend: vi.fn(),
  getAdminReadBackendMode: vi.fn(() => "direct"),
  createAdminEventPhotoUploadViaBackend: vi.fn(),
  reprocessAdminEventPhotosViaBackend: vi.fn(),
  sendMatchedPhotoNotificationViaBackend: vi.fn(),
}));

vi.mock("@/lib/admin/events/repository", () => ({
  createAdminEventPhotoUpload: vi.fn(),
  deleteAdminEventPhoto: vi.fn(),
  deleteAdminEventPhotosBatch: vi.fn(),
}));

const mockedIsAuthorizedAdminRequest = vi.mocked(isAuthorizedAdminRequest);
const mockedResolveAdminIdentity = vi.mocked(resolveAdminIdentity);
const mockedListAdminEvents = vi.mocked(listAdminEventsViaBackend);
const mockedCreateAdminEvent = vi.mocked(createAdminEventViaBackend);
const mockedListAdminEventPhotos = vi.mocked(getAdminEventPhotosPageViaBackend);
const mockedReprocessAdminEventPhotos = vi.mocked(reprocessAdminEventPhotosViaBackend);
const mockedSendMatchedPhotoNotification = vi.mocked(sendMatchedPhotoNotificationViaBackend);
const mockedCreateAdminEventPhotoUploadViaBackend = vi.mocked(createAdminEventPhotoUploadViaBackend);
const mockedDeleteAdminEventPhoto = vi.mocked(deleteAdminEventPhoto);
const mockedDeleteAdminEventPhotosBatch = vi.mocked(deleteAdminEventPhotosBatch);

function makeNextRequest(url: string, init?: RequestInit) {
  return Object.assign(new Request(url, init), {
    nextUrl: new URL(url),
  }) as never;
}

describe("admin api auth and delete behavior", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects unauthorized admin events list requests", async () => {
    mockedIsAuthorizedAdminRequest.mockResolvedValue(false);

    const response = await listEvents(new Request("http://localhost/api/admin/events") as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockedListAdminEvents).not.toHaveBeenCalled();
  });

  it("returns admin event listings when authorized", async () => {
    mockedIsAuthorizedAdminRequest.mockResolvedValue(true);
    mockedListAdminEvents.mockResolvedValue({
      events: [
        {
          id: "event-1",
          slug: "demo",
          title: "Demo",
          venue: "Venue",
          description: "Desc",
          startsAt: "2026-01-01T10:00:00.000Z",
          endsAt: "2026-01-01T12:00:00.000Z",
          photoCount: 3,
        },
      ],
      totalCount: 1,
    });

    const response = await listEvents(makeNextRequest("http://localhost/api/admin/events?page=1&pageSize=20"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      events: [
        {
          id: "event-1",
          slug: "demo",
          title: "Demo",
          venue: "Venue",
          description: "Desc",
          startsAt: "2026-01-01T10:00:00.000Z",
          endsAt: "2026-01-01T12:00:00.000Z",
          photoCount: 3,
        },
      ],
      totalCount: 1,
    });
  });

  it("creates events when authorized", async () => {
    mockedIsAuthorizedAdminRequest.mockResolvedValue(true);
    mockedCreateAdminEvent.mockResolvedValue({
      id: "event-1",
      slug: "demo",
      title: "Demo",
      venue: "Venue",
      description: "Desc",
      startsAt: "2026-01-01T10:00:00.000Z",
      endsAt: "2026-01-01T12:00:00.000Z",
      photoCount: 0,
    });

    const response = await createEvent(
      makeNextRequest("http://localhost/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Demo",
          slug: "demo",
          venue: "Venue",
          description: "Desc",
          startsAt: "2026-01-01T10:00:00.000Z",
          endsAt: "2026-01-01T12:00:00.000Z",
        }),
      }) as never,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: "event-1",
      slug: "demo",
      title: "Demo",
    });
  });

  it("rejects unsupported event logo types", async () => {
    mockedIsAuthorizedAdminRequest.mockResolvedValue(true);
    const formData = new FormData();
    formData.set("title", "Demo");
    formData.set("slug", "demo");
    formData.set("venue", "Venue");
    formData.set("description", "Desc");
    formData.set("startsAt", "2026-01-01T10:00:00.000Z");
    formData.set("endsAt", "2026-01-01T12:00:00.000Z");
    formData.set("logo", new File(["bad"], "logo.gif", { type: "image/gif" }));

    const response = await createEvent(
      makeNextRequest("http://localhost/api/admin/events", {
        method: "POST",
        body: formData,
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Only JPG, PNG, and SVG logos are supported",
    });
    expect(mockedCreateAdminEvent).not.toHaveBeenCalled();
  });

  it("returns event photo listings when authorized", async () => {
    mockedIsAuthorizedAdminRequest.mockResolvedValue(true);
    mockedListAdminEventPhotos.mockResolvedValue({
      event: {
        id: "event-1",
        slug: "demo",
        title: "Demo",
        venue: "Venue",
        description: "Desc",
        startsAt: "2026-01-01T10:00:00.000Z",
        endsAt: "2026-01-01T12:00:00.000Z",
      },
      photos: [],
      faceMatchSummary: {
        totalMatchedFaces: 1,
        totalRegisteredSelfies: 2,
        totalAssociatedUsers: 3,
        matchedFaces: [
          {
            attendeeId: "attendee-1",
            attendeeName: "Alice",
            attendeeEmail: "alice@example.com",
            faceEnrollmentId: "enrollment-1",
            faceId: "face-1",
            matchedPhotoCount: 2,
            lastMatchedAt: "2026-01-01T11:00:00.000Z",
          },
        ],
      },
      page: 1,
      pageSize: 30,
      totalCount: 0,
    });

    const response = await listEventPhotos(
      makeNextRequest("http://localhost/api/admin/events/demo/photos?page=1&pageSize=30"),
      {
        params: Promise.resolve({ eventSlug: "demo" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      event: {
        id: "event-1",
        slug: "demo",
        title: "Demo",
        venue: "Venue",
        description: "Desc",
        startsAt: "2026-01-01T10:00:00.000Z",
        endsAt: "2026-01-01T12:00:00.000Z",
      },
      photos: [],
      faceMatchSummary: {
        totalMatchedFaces: 1,
        totalRegisteredSelfies: 2,
        totalAssociatedUsers: 3,
        matchedFaces: [
          {
            attendeeId: "attendee-1",
            attendeeName: "Alice",
            attendeeEmail: "alice@example.com",
            faceEnrollmentId: "enrollment-1",
            faceId: "face-1",
            matchedPhotoCount: 2,
            lastMatchedAt: "2026-01-01T11:00:00.000Z",
          },
        ],
      },
      page: 1,
      pageSize: 30,
      totalCount: 0,
    });
  });

  it("returns 404 for missing events in the photos route", async () => {
    mockedIsAuthorizedAdminRequest.mockResolvedValue(true);
    mockedListAdminEventPhotos.mockResolvedValue({
      event: null,
      photos: [],
      faceMatchSummary: {
        totalMatchedFaces: 0,
        totalRegisteredSelfies: 0,
        totalAssociatedUsers: 0,
        matchedFaces: [],
      },
      page: 1,
      pageSize: 30,
      totalCount: 0,
    });

    const response = await listEventPhotos(
      makeNextRequest("http://localhost/api/admin/events/missing/photos?page=1&pageSize=30"),
      {
        params: Promise.resolve({ eventSlug: "missing" }),
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Event not found" });
  });

  it("rejects unauthorized single photo delete requests", async () => {
    mockedResolveAdminIdentity.mockResolvedValue(null);

    const response = await deleteSinglePhoto(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/p1", {
        method: "DELETE",
      }) as never,
      {
        params: Promise.resolve({ eventSlug: "demo", photoId: "p1" }),
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockedDeleteAdminEventPhoto).not.toHaveBeenCalled();
  });

  it("rejects unauthorized photo presign requests", async () => {
    mockedResolveAdminIdentity.mockResolvedValue(null);

    const response = await presignPhotoUpload(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: "image/jpeg" }),
      }) as never,
      {
        params: Promise.resolve({ eventSlug: "demo" }),
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockedCreateAdminEventPhotoUploadViaBackend).not.toHaveBeenCalled();
  });

  it("returns a photo upload contract for authorized admins", async () => {
    mockedResolveAdminIdentity.mockResolvedValue({
      sub: "admin-user-1",
      tokenUse: "access",
      groups: ["admin"],
      username: "ops@example.com",
    });
    mockedCreateAdminEventPhotoUploadViaBackend.mockResolvedValue({
      event: { id: "demo", slug: "demo" },
      photo: {
        photoId: "photo-1",
        objectKey: "events/pending/demo/photos/photo-1.jpg",
        uploadedBy: "admin-user-1",
      },
      upload: {
        method: "PUT",
        url: "https://example.com/upload",
        headers: {
          "Content-Type": "image/jpeg",
          "x-amz-meta-event-id": "demo",
          "x-amz-meta-photo-id": "photo-1",
          "x-amz-meta-uploaded-by": "admin-user-1",
        },
        objectKey: "events/pending/demo/photos/photo-1.jpg",
        expiresAt: "2026-04-22T18:00:00.000Z",
      },
    });

    const response = await presignPhotoUpload(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: "image/jpeg", fileSizeBytes: 1234 }),
      }) as never,
      {
        params: Promise.resolve({ eventSlug: "demo" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      event: { id: "demo", slug: "demo" },
      photo: {
        photoId: "photo-1",
        uploadedBy: "admin-user-1",
      },
    });
    expect(mockedCreateAdminEventPhotoUploadViaBackend).toHaveBeenCalledWith({
      eventSlug: "demo",
      contentType: "image/jpeg",
      uploadedBy: "admin-user-1",
    });
  });

  it("passes actor identity to single photo hard-delete", async () => {
    mockedResolveAdminIdentity.mockResolvedValue({
      sub: "admin-user-1",
      tokenUse: "access",
      groups: ["admin"],
      username: "ops@example.com",
    });
    mockedDeleteAdminEventPhoto.mockResolvedValue({
      photoId: "p1",
      status: "deleted",
    });

    const response = await deleteSinglePhoto(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/p1", {
        method: "DELETE",
      }) as never,
      {
        params: Promise.resolve({ eventSlug: "demo", photoId: "p1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(mockedDeleteAdminEventPhoto).toHaveBeenCalledWith({
      eventSlug: "demo",
      photoId: "p1",
      actorSub: "admin-user-1",
    });
  });

  it("requires idempotency key for batch delete", async () => {
    mockedResolveAdminIdentity.mockResolvedValue({
      sub: "admin-user-1",
      tokenUse: "access",
      groups: ["admin"],
      username: "ops@example.com",
    });

    const response = await deletePhotosBatch(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: ["p1", "p2"] }),
      }) as never,
      {
        params: Promise.resolve({ eventSlug: "demo" }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Idempotency-Key header is required",
    });
    expect(mockedDeleteAdminEventPhotosBatch).not.toHaveBeenCalled();
  });

  it("rejects unauthorized photo reprocess requests", async () => {
    mockedResolveAdminIdentity.mockResolvedValue(null);

    const response = await reprocessPhotos(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/reprocess", {
        method: "POST",
      }) as never,
      {
        params: Promise.resolve({ eventSlug: "demo" }),
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockedReprocessAdminEventPhotos).not.toHaveBeenCalled();
  });

  it("reprocesses event photos for authorized admins", async () => {
    mockedResolveAdminIdentity.mockResolvedValue({
      sub: "admin-user-1",
      tokenUse: "access",
      groups: ["admin"],
      username: "ops@example.com",
    });
    mockedReprocessAdminEventPhotos.mockResolvedValue({
      eventSlug: "demo",
      total: 12,
      queued: 11,
      failed: 1,
    });

    const response = await reprocessPhotos(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/reprocess", {
        method: "POST",
      }) as never,
      {
        params: Promise.resolve({ eventSlug: "demo" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      eventSlug: "demo",
      total: 12,
      queued: 11,
      failed: 1,
    });
    expect(mockedReprocessAdminEventPhotos).toHaveBeenCalledWith({
      eventSlug: "demo",
    });
  });

  it("returns 404 when reprocess target event is missing", async () => {
    mockedResolveAdminIdentity.mockResolvedValue({
      sub: "admin-user-1",
      tokenUse: "access",
      groups: ["admin"],
      username: "ops@example.com",
    });
    mockedReprocessAdminEventPhotos.mockResolvedValue(null);

    const response = await reprocessPhotos(
      makeNextRequest("http://localhost/api/admin/events/missing/photos/reprocess", {
        method: "POST",
      }) as never,
      {
        params: Promise.resolve({ eventSlug: "missing" }),
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Event not found" });
  });

  it("rejects unauthorized manual notification requests", async () => {
    mockedResolveAdminIdentity.mockResolvedValue(null);

    const response = await notifyPhotoMatch(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeId: "attendee-1" }),
      }) as never,
      {
        params: Promise.resolve({ eventSlug: "demo" }),
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockedSendMatchedPhotoNotification).not.toHaveBeenCalled();
  });

  it("validates attendee id for manual notification requests", async () => {
    mockedResolveAdminIdentity.mockResolvedValue({
      sub: "admin-user-1",
      tokenUse: "access",
      groups: ["admin"],
      username: "ops@example.com",
    });

    const response = await notifyPhotoMatch(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeId: "" }),
      }) as never,
      {
        params: Promise.resolve({ eventSlug: "demo" }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "attendeeId is required" });
    expect(mockedSendMatchedPhotoNotification).not.toHaveBeenCalled();
  });

  it("sends manual matched-photo notification for an attendee", async () => {
    mockedResolveAdminIdentity.mockResolvedValue({
      sub: "admin-user-1",
      tokenUse: "access",
      groups: ["admin"],
      username: "ops@example.com",
    });
    mockedSendMatchedPhotoNotification.mockResolvedValue({
      scanned: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });

    const response = await notifyPhotoMatch(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeId: "attendee-1" }),
      }) as never,
      {
        params: Promise.resolve({ eventSlug: "demo" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      scanned: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
      message: "Notification email sent",
    });
    expect(mockedSendMatchedPhotoNotification).toHaveBeenCalledWith({
      eventSlug: "demo",
      attendeeId: "attendee-1",
      forceResend: true,
    });
  });

  it("returns 500 when notifier reports internal send failures", async () => {
    mockedResolveAdminIdentity.mockResolvedValue({
      sub: "admin-user-1",
      tokenUse: "access",
      groups: ["admin"],
      username: "ops@example.com",
    });
    mockedSendMatchedPhotoNotification.mockResolvedValue({
      scanned: 1,
      sent: 0,
      skipped: 0,
      failed: 1,
    });

    const response = await notifyPhotoMatch(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeId: "attendee-1" }),
      }) as never,
      {
        params: Promise.resolve({ eventSlug: "demo" }),
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      scanned: 1,
      sent: 0,
      skipped: 0,
      failed: 1,
      error: "Internal error sending notifications",
    });
  });

  it("rejects idempotency-key reuse with a different payload", async () => {
    mockedResolveAdminIdentity.mockResolvedValue({
      sub: "admin-user-1",
      tokenUse: "access",
      groups: ["admin"],
      username: "ops@example.com",
    });
    mockedDeleteAdminEventPhotosBatch.mockRejectedValue(
      new Error("IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD"),
    );

    const response = await deletePhotosBatch(
      makeNextRequest("http://localhost/api/admin/events/demo/photos/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "batch-001",
        },
        body: JSON.stringify({ photoIds: ["p1"] }),
      }) as never,
      {
        params: Promise.resolve({ eventSlug: "demo" }),
      },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Idempotency-Key cannot be reused with a different payload",
    });
    expect(mockedDeleteAdminEventPhotosBatch).toHaveBeenCalledWith({
      eventSlug: "demo",
      photoIds: ["p1"],
      actorSub: "admin-user-1",
      idempotencyKey: "batch-001",
    });
  });
});
