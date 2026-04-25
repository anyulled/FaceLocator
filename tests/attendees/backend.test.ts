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

function encodePayload(v: unknown) {
  return Buffer.from(JSON.stringify(v), "utf8");
}

describe("attendees backend — mode resolution", () => {
  afterEach(() => {
    delete process.env.PUBLIC_REGISTRATION_BACKEND;
    delete process.env.FACE_LOCATOR_PUBLIC_REGISTRATION_BACKEND;
    delete process.env.ATTENDEE_REGISTRATION_BACKEND;
    delete process.env.FACE_LOCATOR_REPOSITORY_TYPE;
    delete process.env.FACE_LOCATOR_ATTENDEE_REGISTRATION_LAMBDA_NAME;
    delete process.env.ATTENDEE_REGISTRATION_LAMBDA_NAME;
  });

  it("returns direct mode by default", async () => {
    const { getPublicRegistrationBackendMode } = await import("@/lib/attendees/backend");
    expect(getPublicRegistrationBackendMode()).toBe("direct");
  });

  it("returns direct when ATTENDEE_REGISTRATION_BACKEND=direct", async () => {
    process.env.ATTENDEE_REGISTRATION_BACKEND = "direct";
    const { getPublicRegistrationBackendMode } = await import("@/lib/attendees/backend");
    expect(getPublicRegistrationBackendMode()).toBe("direct");
  });

  it("returns lambda when ATTENDEE_REGISTRATION_BACKEND=lambda", async () => {
    process.env.ATTENDEE_REGISTRATION_BACKEND = "lambda";
    const { getPublicRegistrationBackendMode } = await import("@/lib/attendees/backend");
    expect(getPublicRegistrationBackendMode()).toBe("lambda");
  });

  it("returns lambda when FACE_LOCATOR_REPOSITORY_TYPE=postgres", async () => {
    process.env.FACE_LOCATOR_REPOSITORY_TYPE = "postgres";
    const { getPublicRegistrationBackendMode } = await import("@/lib/attendees/backend");
    expect(getPublicRegistrationBackendMode()).toBe("lambda");
  });

  it("falls back to default lambda name", async () => {
    const { getAttendeeRegistrationLambdaName } = await import("@/lib/attendees/backend");
    expect(getAttendeeRegistrationLambdaName()).toBe("face-locator-poc-attendee-registration");
  });

  it("reads FACE_LOCATOR_ATTENDEE_REGISTRATION_LAMBDA_NAME", async () => {
    process.env.FACE_LOCATOR_ATTENDEE_REGISTRATION_LAMBDA_NAME = "custom-reg-lambda";
    const { getAttendeeRegistrationLambdaName } = await import("@/lib/attendees/backend");
    expect(getAttendeeRegistrationLambdaName()).toBe("custom-reg-lambda");
  });

  it("reads ATTENDEE_REGISTRATION_LAMBDA_NAME as fallback", async () => {
    process.env.ATTENDEE_REGISTRATION_LAMBDA_NAME = "fallback-reg-lambda";
    const { getAttendeeRegistrationLambdaName } = await import("@/lib/attendees/backend");
    expect(getAttendeeRegistrationLambdaName()).toBe("fallback-reg-lambda");
  });
});

describe("attendees backend — lambda invocation", () => {
  beforeEach(() => {
    process.env.ATTENDEE_REGISTRATION_BACKEND = "lambda";
    sendMock.mockReset();
  });

  afterEach(() => {
    delete process.env.ATTENDEE_REGISTRATION_BACKEND;
  });

  it("returns event data from lambda", async () => {
    const event = { slug: "demo", title: "Demo", venue: "V", scheduledAt: "2026-01-01T10:00:00Z", description: "D" };
    sendMock.mockResolvedValue({ Payload: encodePayload({ event }) });

    const { getPublicEventBySlugViaBackend } = await import("@/lib/attendees/backend");
    const result = await getPublicEventBySlugViaBackend("demo");
    expect(result.event).toMatchObject({ slug: "demo", title: "Demo" });
  });

  it("throws ApiError on empty lambda payload", async () => {
    sendMock.mockResolvedValue({ Payload: null });

    const { getPublicEventBySlugViaBackend } = await import("@/lib/attendees/backend");
    await expect(getPublicEventBySlugViaBackend("demo")).rejects.toMatchObject({
      status: 502,
    });
  });

  it("throws ApiError when lambda returns statusCode error shape", async () => {
    sendMock.mockResolvedValue({
      Payload: encodePayload({
        statusCode: 404,
        error: { code: "INVALID_EVENT", message: "Event not found" },
      }),
    });

    const { getPublicEventBySlugViaBackend } = await import("@/lib/attendees/backend");
    await expect(getPublicEventBySlugViaBackend("missing")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws ApiError wrapping REGISTRATION_NOT_FOUND code", async () => {
    sendMock.mockResolvedValue({
      Payload: encodePayload({
        statusCode: 404,
        error: { code: "REGISTRATION_NOT_FOUND", message: "Not found" },
      }),
    });

    const { getPublicEventBySlugViaBackend } = await import("@/lib/attendees/backend");
    await expect(getPublicEventBySlugViaBackend("demo")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("returns registration intent on createRegistrationIntentViaBackend", async () => {
    const intent = { registrationId: "r1", attendeeId: "a1", upload: { method: "PUT", url: "https://s3/up", headers: {}, objectKey: "k", expiresAt: "2026-01-01T11:00:00Z" }, status: "UPLOAD_PENDING" };
    sendMock.mockResolvedValue({ Payload: encodePayload(intent) });

    const { createRegistrationIntentViaBackend } = await import("@/lib/attendees/backend");
    const result = await createRegistrationIntentViaBackend({ eventSlug: "demo", name: "Alice", email: "alice@example.com", selfie: "key" });
    expect(result).toMatchObject({ registrationId: "r1" });
  });

  it("returns status on getRegistrationStatusViaBackend", async () => {
    const statusResp = { registrationId: "r1", status: "ENROLLED", attendeeId: "a1" };
    sendMock.mockResolvedValue({ Payload: encodePayload(statusResp) });

    const { getRegistrationStatusViaBackend } = await import("@/lib/attendees/backend");
    const result = await getRegistrationStatusViaBackend("r1");
    expect(result).toMatchObject({ status: "ENROLLED" });
  });
});
