import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-lambda", () => ({
  InvokeCommand: class InvokeCommand {
    public readonly input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  },
  LambdaClient: class LambdaClient {
    public readonly config: unknown;

    constructor(config: unknown) {
      this.config = config;
    }

    send = sendMock;
  },
}));

const consoleErrorMock = vi.fn();

describe("matched photo backend", () => {
  beforeEach(() => {
    process.env.MATCH_LINK_BACKEND = "lambda";
    delete process.env.FACE_LOCATOR_REPOSITORY_TYPE;
    delete process.env.FACE_LOCATOR_MATCH_LINK_BACKEND;
    delete process.env.FACE_LOCATOR_MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME;
    delete process.env.MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME;
    sendMock.mockReset();
    consoleErrorMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(consoleErrorMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MATCH_LINK_BACKEND;
  });

  it("returns null when the Lambda execution fails", async () => {
    sendMock.mockResolvedValue({
      FunctionError: "Unhandled",
      Payload: Buffer.from(JSON.stringify({ errorMessage: "boom" }), "utf8"),
      $metadata: {
        requestId: "req-123",
      },
    });

    const { getMatchedGalleryDataViaBackend } = await import("@/lib/notifications/backend");

    const result = await getMatchedGalleryDataViaBackend({
      eventId: "cantus-laudis-2026",
      faceId: "face_123",
      token: "valid",
    });

    expect(result).toBeNull();
    expect(consoleErrorMock).toHaveBeenCalledTimes(1);

    const log = JSON.parse(consoleErrorMock.mock.calls[0][0] as string) as {
      scope: string;
      operation: string;
      backend: string;
      functionError: string | null;
      requestId: string | null;
      reason: string;
    };
    expect(log).toMatchObject({
      scope: "notifications",
      operation: "getGalleryPageData",
      backend: "lambda",
      functionError: "Unhandled",
      requestId: "req-123",
      reason: "Lambda returned an error response.",
    });
  });

  it("returns null when the Lambda payload shape is malformed", async () => {
    sendMock.mockResolvedValue({
      Payload: Buffer.from(
        JSON.stringify({
          attendeeName: "Jane Doe",
          photoUrls: "not-an-array",
        }),
        "utf8",
      ),
      $metadata: {
        requestId: "req-456",
      },
    });

    const { getMatchedGalleryDataViaBackend } = await import("@/lib/notifications/backend");

    const result = await getMatchedGalleryDataViaBackend({
      eventId: "cantus-laudis-2026",
      faceId: "face_123",
      token: "valid",
    });

    expect(result).toBeNull();
    expect(consoleErrorMock).toHaveBeenCalledTimes(1);

    const log = JSON.parse(consoleErrorMock.mock.calls[0][0] as string) as {
      scope: string;
      operation: string;
      backend: string;
      requestId: string | null;
      reason: string;
    };
    expect(log).toMatchObject({
      scope: "notifications",
      operation: "getGalleryPageData",
      backend: "lambda",
      requestId: "req-456",
      reason: "Lambda returned an unexpected payload shape.",
    });
  });
});
