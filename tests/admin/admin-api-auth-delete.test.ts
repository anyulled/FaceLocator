import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as listEvents } from "@/app/api/admin/events/route";
import { POST as createEvent } from "@/app/api/admin/events/route";
import { GET as listEventPhotos } from "@/app/api/admin/events/[eventSlug]/photos/route";
import { POST as deletePhotosBatch } from "@/app/api/admin/events/[eventSlug]/photos/delete/route";
import { DELETE as deleteSinglePhoto } from "@/app/api/admin/events/[eventSlug]/photos/[photoId]/route";
import {
  createAdminEvent,
  deleteAdminEventPhoto,
  deleteAdminEventPhotosBatch,
  getAdminEventPhotosPage,
  listAdminEvents,
} from "@/lib/admin/events/backend";
import { isAuthorizedAdminRequest, resolveAdminIdentity } from "@/lib/admin/auth";

vi.mock("@/lib/admin/auth", () => ({
  isAuthorizedAdminRequest: vi.fn(),
  resolveAdminIdentity: vi.fn(),
}));

vi.mock("@/lib/admin/events/backend", () => ({
  listAdminEvents: vi.fn(),
  getAdminEventPhotosPage: vi.fn(),
  createAdminEvent: vi.fn(),
  deleteAdminEventPhoto: vi.fn(),
  deleteAdminEventPhotosBatch: vi.fn(),
}));

const mockedIsAuthorizedAdminRequest = vi.mocked(isAuthorizedAdminRequest);
const mockedResolveAdminIdentity = vi.mocked(resolveAdminIdentity);
const mockedListAdminEvents = vi.mocked(listAdminEvents);
const mockedGetAdminEventPhotosPage = vi.mocked(getAdminEventPhotosPage);
const mockedCreateAdminEvent = vi.mocked(createAdminEvent);
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

  it("returns event photo listings when authorized", async () => {
    mockedIsAuthorizedAdminRequest.mockResolvedValue(true);
    mockedGetAdminEventPhotosPage.mockResolvedValue({
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
      page: 1,
      pageSize: 30,
      totalCount: 0,
    });
  });

  it("returns 404 for missing events in the photos route", async () => {
    mockedIsAuthorizedAdminRequest.mockResolvedValue(true);
    mockedGetAdminEventPhotosPage.mockResolvedValue({
      event: null,
      photos: [],
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
