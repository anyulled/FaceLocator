import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/events/backend", () => ({
  AdminReadBackendError: class extends Error {
    statusCode: number;
    details: Record<string, unknown>;
    constructor(message: string, statusCode: number, details?: Record<string, unknown>) {
      super(message);
      this.name = "AdminReadBackendError";
      this.statusCode = statusCode;
      this.details = details ?? {};
    }
  },
}));

vi.mock("@/lib/aws/database-errors", () => ({
  describeDatabaseError: vi.fn((e: unknown) => ({ kind: "query", status: 500, message: (e as Error).message })),
  isDatabaseErrorLike: vi.fn(() => false),
}));

import { AdminReadBackendError } from "@/lib/admin/events/backend";
import { isDatabaseErrorLike } from "@/lib/aws/database-errors";
import { buildAdminErrorResponse, extractRequestId } from "@/lib/admin/events/route-utils";

describe("extractRequestId", () => {
  it("returns x-amz-cf-id when present", () => {
    const headers = new Headers({ "x-amz-cf-id": "cf-123" });
    expect(extractRequestId(headers)).toBe("cf-123");
  });

  it("returns x-amzn-requestid when cf-id is absent", () => {
    const headers = new Headers({ "x-amzn-requestid": "amzn-456" });
    expect(extractRequestId(headers)).toBe("amzn-456");
  });

  it("returns x-correlation-id as fallback", () => {
    const headers = new Headers({ "x-correlation-id": "corr-789" });
    expect(extractRequestId(headers)).toBe("corr-789");
  });

  it("returns null when no request ID headers exist", () => {
    const headers = new Headers();
    expect(extractRequestId(headers)).toBeNull();
  });
});

describe("buildAdminErrorResponse", () => {
  it("returns 503 with generic message for unknown errors", () => {
    const result = buildAdminErrorResponse({
      error: new Error("Something broke"),
      scope: "test-api",
      requestPath: "/api/test",
      requestId: null,
      defaultMessage: "Test failed",
      defaultStatus: 503,
    });

    expect(result.status).toBe(503);
  });

  it("returns database error status when error is database-like", () => {
    vi.mocked(isDatabaseErrorLike).mockReturnValueOnce(true);

    const dbError = Object.assign(new Error("unique_violation"), { code: "23505" });
    const result = buildAdminErrorResponse({
      error: dbError,
      scope: "test-api",
      requestPath: "/api/test",
      requestId: "req-1",
      defaultMessage: "Test failed",
      defaultStatus: 503,
    });

    expect(result.status).toBe(500);
  });

  it("returns backend error status for AdminReadBackendError", () => {
    const backendError = new AdminReadBackendError("Lambda failed", 502, { backend: "lambda" });
    const result = buildAdminErrorResponse({
      error: backendError,
      scope: "test-api",
      requestPath: "/api/test",
      requestId: null,
      defaultMessage: "Test failed",
      defaultStatus: 503,
    });

    expect(result.status).toBe(502);
  });

  it("handles non-Error objects", () => {
    const result = buildAdminErrorResponse({
      error: "a string error",
      scope: "test-api",
      requestPath: "/api/test",
      requestId: null,
      defaultMessage: "Test failed",
      defaultStatus: 500,
    });

    expect(result.status).toBe(500);
  });

  it("includes requestId in response body", async () => {
    const result = buildAdminErrorResponse({
      error: new Error("x"),
      scope: "test-api",
      requestPath: "/api/test",
      requestId: "req-abc",
      defaultMessage: "Test failed",
      defaultStatus: 503,
    });

    const body = await result.json();
    expect(body.requestId).toBe("req-abc");
  });

  it("passes extra context through to logging", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    buildAdminErrorResponse({
      error: new Error("x"),
      scope: "test-api",
      requestPath: "/api/test",
      requestId: null,
      defaultMessage: "Test failed",
      defaultStatus: 503,
      context: { eventSlug: "demo", photoId: "p1" },
    });

    expect(consoleSpy).toHaveBeenCalled();
    const logged = JSON.parse(consoleSpy.mock.calls[0]?.[0] as string);
    expect(logged.eventSlug).toBe("demo");
    expect(logged.photoId).toBe("p1");

    consoleSpy.mockRestore();
  });
});
