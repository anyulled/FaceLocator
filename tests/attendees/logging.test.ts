import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  headers: vi.fn().mockResolvedValue(new Headers() as any),
}));

vi.mock("@/lib/aws/database-errors", () => ({
  describeDatabaseError: vi.fn(() => ({ kind: "query", status: 500, message: "DB error" })),
  isDatabaseErrorLike: vi.fn(() => false),
}));

import { AttendeeApiError } from "@/lib/attendees/errors";
import { isDatabaseErrorLike } from "@/lib/aws/database-errors";
import {
  CORRELATION_HEADER,
  errorResponseWithCorrelationId,
  getRequestCorrelationId,
  jsonWithCorrelationId,
  logRouteError,
  logRouteInfo,
} from "@/lib/attendees/logging";

describe("getRequestCorrelationId", () => {
  it("returns header value when present", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { [CORRELATION_HEADER]: "test-corr-id" },
    });
    expect(getRequestCorrelationId(req)).toBe("test-corr-id");
  });

  it("returns generated UUID when header is absent", () => {
    const req = new Request("http://localhost/api/test");
    const result = getRequestCorrelationId(req);
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("logRouteInfo", () => {
  it("logs info message with context", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logRouteInfo("test message", { correlationId: "c1", eventSlug: "demo" });
    expect(spy).toHaveBeenCalledOnce();
    const logged = JSON.parse(spy.mock.calls[0]?.[0] as string);
    expect(logged.level).toBe("info");
    expect(logged.message).toBe("test message");
    expect(logged.eventSlug).toBe("demo");
    spy.mockRestore();
  });
});

describe("logRouteError", () => {
  it("logs AttendeeApiError with its code", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new AttendeeApiError(404, "REGISTRATION_NOT_FOUND", "Not found");
    logRouteError(err, { correlationId: "c1" });
    const logged = JSON.parse(spy.mock.calls[0]?.[0] as string);
    expect(logged.code).toBe("REGISTRATION_NOT_FOUND");
    expect(logged.message).toBe("Not found");
    spy.mockRestore();
  });

  it("logs generic Error with INTERNAL_ERROR code", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logRouteError(new Error("Boom"), { correlationId: "c2" });
    const logged = JSON.parse(spy.mock.calls[0]?.[0] as string);
    expect(logged.code).toBe("INTERNAL_ERROR");
    expect(logged.message).toBe("Boom");
    spy.mockRestore();
  });

  it("logs non-Error with Unknown error message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logRouteError("string error", { correlationId: "c3" });
    const logged = JSON.parse(spy.mock.calls[0]?.[0] as string);
    expect(logged.message).toBe("Unknown error");
    spy.mockRestore();
  });

  it("includes database error when applicable", () => {
    vi.mocked(isDatabaseErrorLike).mockReturnValueOnce(true);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logRouteError(new Error("query failed"), { correlationId: "c4" });
    const logged = JSON.parse(spy.mock.calls[0]?.[0] as string);
    expect(logged.database).toEqual({ kind: "query", status: 500, message: "DB error" });
    spy.mockRestore();
  });
});

describe("jsonWithCorrelationId", () => {
  it("returns response with correlation header", async () => {
    const res = jsonWithCorrelationId({ ok: true }, "corr-123");
    expect(res.headers.get(CORRELATION_HEADER)).toBe("corr-123");
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("respects custom status", async () => {
    const res = jsonWithCorrelationId({ error: "x" }, "corr-1", { status: 400 });
    expect(res.status).toBe(400);
  });
});

describe("errorResponseWithCorrelationId", () => {
  it("uses AttendeeApiError status", () => {
    const err = new AttendeeApiError(400, "INVALID_EVENT", "Bad input");
    const res = errorResponseWithCorrelationId(err, "corr-1");
    expect(res.status).toBe(400);
    expect(res.headers.get(CORRELATION_HEADER)).toBe("corr-1");
  });

  it("uses database error status when applicable", () => {
    vi.mocked(isDatabaseErrorLike).mockReturnValueOnce(true);
    const err = new Error("DB failure");
    const res = errorResponseWithCorrelationId(err, "corr-2");
    expect(res.status).toBe(500); // from describeDatabaseError mock
  });

  it("defaults to 500 for unknown errors", () => {
    const res = errorResponseWithCorrelationId(new Error("unknown"), "corr-3");
    expect(res.status).toBe(500);
  });
});
