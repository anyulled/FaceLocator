import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as listEvents } from "@/app/api/admin/events/route";
import { POST as deletePhotosBatch } from "@/app/api/admin/events/[eventSlug]/photos/delete/route";
import { DELETE as deleteSinglePhoto } from "@/app/api/admin/events/[eventSlug]/photos/[photoId]/route";
import {
  deleteAdminEventPhoto,
  deleteAdminEventPhotosBatch,
  listAdminEvents,
} from "@/lib/admin/events/repository";
import { isAuthorizedAdminRequest, resolveAdminIdentity } from "@/lib/admin/auth";

vi.mock("@/lib/admin/auth", () => ({
  isAuthorizedAdminRequest: vi.fn(),
  resolveAdminIdentity: vi.fn(),
}));

vi.mock("@/lib/admin/events/repository", () => ({
  listAdminEvents: vi.fn(),
  deleteAdminEventPhoto: vi.fn(),
  deleteAdminEventPhotosBatch: vi.fn(),
}));

const mockedIsAuthorizedAdminRequest = vi.mocked(isAuthorizedAdminRequest);
const mockedResolveAdminIdentity = vi.mocked(resolveAdminIdentity);
const mockedListAdminEvents = vi.mocked(listAdminEvents);
const mockedDeleteAdminEventPhoto = vi.mocked(deleteAdminEventPhoto);
const mockedDeleteAdminEventPhotosBatch = vi.mocked(deleteAdminEventPhotosBatch);

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

  it("rejects unauthorized single photo delete requests", async () => {
    mockedResolveAdminIdentity.mockResolvedValue(null);

    const response = await deleteSinglePhoto(
      new Request("http://localhost/api/admin/events/demo/photos/p1", {
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
      new Request("http://localhost/api/admin/events/demo/photos/p1", {
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
      new Request("http://localhost/api/admin/events/demo/photos/delete", {
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
      new Request("http://localhost/api/admin/events/demo/photos/delete", {
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
