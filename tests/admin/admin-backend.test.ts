import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock, getSignedUrlMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  getSignedUrlMock: vi.fn().mockResolvedValue("https://signed.example.com/photo"),
}));

vi.mock("@aws-sdk/client-lambda", () => ({
  InvokeCommand: class {
    constructor(public readonly input: unknown) {}
  },
  LambdaClient: class {
    constructor(public readonly config: unknown) {}
    send = sendMock;
  },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
  HeadObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
  S3Client: class {
    constructor(public readonly config: unknown) {}
    send = sendMock;
  },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin/events/repository", () => ({
  createAdminEvent: vi.fn(),
  createAdminEventPhotoUpload: vi.fn(),
  listAdminEventSelfies: vi.fn(),
  listAdminEvents: vi.fn(),
}));

vi.mock("@/lib/aws/database", () => ({
  getDatabasePool: vi.fn(),
}));

import { listAdminEvents } from "@/lib/admin/events/repository";
import { getDatabasePool } from "@/lib/aws/database";

const mockedListAdminEvents = vi.mocked(listAdminEvents);
const mockedGetDatabasePool = vi.mocked(getDatabasePool);

function encodePayload(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8");
}

describe("AdminReadBackendError", () => {
  it("carries statusCode and details", async () => {
    const { AdminReadBackendError } = await import("@/lib/admin/events/backend");
    const err = new AdminReadBackendError("something failed", 502, {
      operation: "listAdminEvents",
      backend: "lambda",
      lambdaName: "my-lambda",
    });
    expect(err.name).toBe("AdminReadBackendError");
    expect(err.statusCode).toBe(502);
    expect(err.details.operation).toBe("listAdminEvents");
    expect(err.message).toBe("something failed");
  });
});

describe("admin worker env resolution", () => {
  it("falls back to the default worker lambda name", async () => {
    delete process.env.FACE_LOCATOR_EVENT_PHOTO_WORKER_LAMBDA_NAME;
    delete process.env.EVENT_PHOTO_WORKER_LAMBDA_NAME;

    const { getEventPhotoWorkerLambdaName } = await import("@/lib/admin/events/backend");
    expect(getEventPhotoWorkerLambdaName()).toBe("face-locator-poc-event-photo-worker");
  });

  it("reads the primary worker lambda env var", async () => {
    process.env.FACE_LOCATOR_EVENT_PHOTO_WORKER_LAMBDA_NAME = "worker-primary";

    const { getEventPhotoWorkerLambdaName } = await import("@/lib/admin/events/backend");
    expect(getEventPhotoWorkerLambdaName()).toBe("worker-primary");
  });

  it("reads the fallback notifier env var", async () => {
    delete process.env.FACE_LOCATOR_MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME;
    process.env.MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME = "notifier-fallback";

    const { getMatchedPhotoNotifierLambdaName } = await import("@/lib/admin/events/backend");
    expect(getMatchedPhotoNotifierLambdaName()).toBe("notifier-fallback");
  });
});

describe("admin backend direct reads", () => {
  beforeEach(() => {
    mockedListAdminEvents.mockReset();
  });

  it("delegates listAdminEventsViaBackend to the repository", async () => {
    mockedListAdminEvents.mockResolvedValue({ events: [], totalCount: 0 });

    const { listAdminEventsViaBackend } = await import("@/lib/admin/events/backend");
    await expect(listAdminEventsViaBackend({ page: 1, pageSize: 30 })).resolves.toEqual({
      events: [],
      totalCount: 0,
    });
    expect(mockedListAdminEvents).toHaveBeenCalledWith({ page: 1, pageSize: 30 });
  });
});

describe("reprocessAdminEventPhotosViaBackend", () => {
  beforeEach(() => {
    sendMock.mockReset();
    mockedGetDatabasePool.mockReset();
  });

  it("returns null when the event slug is unknown", async () => {
    mockedGetDatabasePool.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as never);

    const { reprocessAdminEventPhotosViaBackend } = await import("@/lib/admin/events/backend");
    await expect(reprocessAdminEventPhotosViaBackend({ eventSlug: "missing" })).resolves.toBeNull();
  });

  it("invokes the event photo worker and returns the summary", async () => {
    mockedGetDatabasePool.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ id: "event-1" }] }),
    } as never);
    sendMock.mockResolvedValue({
      Payload: encodePayload({ eventSlug: "demo", total: 5, queued: 4, failed: 1 }),
    });

    const { reprocessAdminEventPhotosViaBackend } = await import("@/lib/admin/events/backend");
    await expect(reprocessAdminEventPhotosViaBackend({ eventSlug: "demo" })).resolves.toEqual({
      eventSlug: "demo",
      total: 5,
      queued: 4,
      failed: 1,
    });
  });

  it("throws on an empty worker payload", async () => {
    mockedGetDatabasePool.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ id: "event-1" }] }),
    } as never);
    sendMock.mockResolvedValue({ Payload: null });

    const { AdminReadBackendError, reprocessAdminEventPhotosViaBackend } = await import(
      "@/lib/admin/events/backend"
    );
    await expect(reprocessAdminEventPhotosViaBackend({ eventSlug: "demo" })).rejects.toBeInstanceOf(
      AdminReadBackendError,
    );
  });

  it("throws when the worker responds with a statusCode payload", async () => {
    mockedGetDatabasePool.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ id: "event-1" }] }),
    } as never);
    sendMock.mockResolvedValue({
      Payload: encodePayload({ statusCode: 429, errorMessage: "Worker throttled" }),
    });

    const { reprocessAdminEventPhotosViaBackend } = await import("@/lib/admin/events/backend");
    await expect(reprocessAdminEventPhotosViaBackend({ eventSlug: "demo" })).rejects.toMatchObject({
      name: "AdminReadBackendError",
      statusCode: 429,
      message: "Worker throttled",
    });
  });

  it("wraps worker invocation failures", async () => {
    mockedGetDatabasePool.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ id: "event-1" }] }),
    } as never);
    sendMock.mockRejectedValue(new Error("invoke error"));

    const { AdminReadBackendError, reprocessAdminEventPhotosViaBackend } = await import(
      "@/lib/admin/events/backend"
    );
    await expect(reprocessAdminEventPhotosViaBackend({ eventSlug: "demo" })).rejects.toBeInstanceOf(
      AdminReadBackendError,
    );
  });

  it("wraps non-Error worker failures", async () => {
    mockedGetDatabasePool.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ id: "event-1" }] }),
    } as never);
    sendMock.mockRejectedValue("invoke failure");

    const { AdminReadBackendError, reprocessAdminEventPhotosViaBackend } = await import(
      "@/lib/admin/events/backend"
    );
    const error = await reprocessAdminEventPhotosViaBackend({ eventSlug: "demo" }).catch((value) => value);

    expect(error).toBeInstanceOf(AdminReadBackendError);
    expect((error as InstanceType<typeof AdminReadBackendError>).statusCode).toBe(503);
  });
});

describe("sendMatchedPhotoNotificationViaBackend", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("returns the notification summary on success", async () => {
    sendMock.mockResolvedValue({
      Payload: encodePayload({ scanned: 1, sent: 1, skipped: 0, failed: 0 }),
    });

    const { sendMatchedPhotoNotificationViaBackend } = await import("@/lib/admin/events/backend");
    await expect(
      sendMatchedPhotoNotificationViaBackend({
        eventSlug: "demo",
        attendeeId: "a1",
      }),
    ).resolves.toEqual({
      scanned: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
  });

  it("throws on an empty notifier payload", async () => {
    sendMock.mockResolvedValue({ Payload: null });

    const { AdminReadBackendError, sendMatchedPhotoNotificationViaBackend } = await import(
      "@/lib/admin/events/backend"
    );
    await expect(
      sendMatchedPhotoNotificationViaBackend({
        eventSlug: "demo",
        attendeeId: "a1",
      }),
    ).rejects.toBeInstanceOf(AdminReadBackendError);
  });

  it("throws when the notifier responds with a statusCode payload", async () => {
    sendMock.mockResolvedValue({
      Payload: encodePayload({ statusCode: 500, errorMessage: "Lambda crashed" }),
    });

    const { AdminReadBackendError, sendMatchedPhotoNotificationViaBackend } = await import(
      "@/lib/admin/events/backend"
    );
    await expect(
      sendMatchedPhotoNotificationViaBackend({
        eventSlug: "demo",
        attendeeId: "a1",
      }),
    ).rejects.toBeInstanceOf(AdminReadBackendError);
  });

  it("wraps notification invocation failures", async () => {
    sendMock.mockRejectedValue(new Error("connection refused"));

    const { AdminReadBackendError, sendMatchedPhotoNotificationViaBackend } = await import(
      "@/lib/admin/events/backend"
    );
    await expect(
      sendMatchedPhotoNotificationViaBackend({
        eventSlug: "demo",
        attendeeId: "a1",
      }),
    ).rejects.toBeInstanceOf(AdminReadBackendError);
  });

  it("wraps non-Error notifier failures", async () => {
    sendMock.mockRejectedValue("connection refused");

    const { AdminReadBackendError, sendMatchedPhotoNotificationViaBackend } = await import(
      "@/lib/admin/events/backend"
    );
    const error = await sendMatchedPhotoNotificationViaBackend({
      eventSlug: "demo",
      attendeeId: "a1",
    }).catch((value) => value);

    expect(error).toBeInstanceOf(AdminReadBackendError);
    expect((error as InstanceType<typeof AdminReadBackendError>).statusCode).toBe(503);
  });
});
