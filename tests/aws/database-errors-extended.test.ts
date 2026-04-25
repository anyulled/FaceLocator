import { describe, expect, it } from "vitest";

import {
  classifyDatabaseError,
  DatabaseOperationError,
  describeDatabaseError,
  isDatabaseErrorLike,
  isDatabaseOperationError,
  runDatabaseOperation,
  wrapDatabaseError,
} from "@/lib/aws/database-errors";

// Export the classifyDatabaseError function for testing via wrapDatabaseError
// since it is an internal helper — we validate it through the public API

describe("DatabaseOperationError", () => {
  it("constructs with all properties", () => {
    const err = new DatabaseOperationError({
      operation: "test.op",
      kind: "connectivity",
      status: 503,
      message: "Failed",
      troubleshooting: "Check your VPN",
      context: { eventId: "e1" },
    });
    expect(err.name).toBe("DatabaseOperationError");
    expect(err.operation).toBe("test.op");
    expect(err.kind).toBe("connectivity");
    expect(err.status).toBe(503);
    expect(err.troubleshooting).toBe("Check your VPN");
    expect(err.context).toEqual({ eventId: "e1" });
  });

  it("defaults context and details to empty objects", () => {
    const err = new DatabaseOperationError({
      operation: "test.op",
      kind: "query",
      status: 500,
      message: "Bad query",
      troubleshooting: "Check SQL",
    });
    expect(err.context).toEqual({});
    expect(err.details).toEqual({});
  });
});

describe("isDatabaseOperationError", () => {
  it("returns true for DatabaseOperationError instances", () => {
    const err = new DatabaseOperationError({
      operation: "x",
      kind: "query",
      status: 500,
      message: "m",
      troubleshooting: "t",
    });
    expect(isDatabaseOperationError(err)).toBe(true);
  });

  it("returns false for plain errors", () => {
    expect(isDatabaseOperationError(new Error("plain"))).toBe(false);
  });
});

describe("isDatabaseErrorLike", () => {
  it("returns true for DatabaseOperationError", () => {
    const err = new DatabaseOperationError({ operation: "x", kind: "query", status: 500, message: "m", troubleshooting: "t" });
    expect(isDatabaseErrorLike(err)).toBe(true);
  });

  it("returns true for objects with database error shape (code field)", () => {
    expect(isDatabaseErrorLike({ code: "23505", message: "duplicate key" })).toBe(true);
  });

  it("returns true for objects with severity field", () => {
    expect(isDatabaseErrorLike({ severity: "ERROR", message: "some pg error" })).toBe(true);
  });

  it("returns false for plain objects without db shape", () => {
    expect(isDatabaseErrorLike({ foo: "bar" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isDatabaseErrorLike(null)).toBe(false);
  });
});

describe("describeDatabaseError", () => {
  it("extracts fields from DatabaseOperationError", () => {
    const err = new DatabaseOperationError({
      operation: "test.op",
      kind: "connectivity",
      status: 503,
      message: "DB down",
      troubleshooting: "Check VPC",
    });
    const desc = describeDatabaseError(err);
    expect(desc.operation).toBe("test.op");
    expect(desc.kind).toBe("connectivity");
    expect(desc.status).toBe(503);
  });

  it("classifies connectivity error from plain error", () => {
    const err = { code: "ECONNREFUSED", message: "connection refused" };
    const desc = describeDatabaseError(err, "connecting to pool");
    expect(desc.kind).toBe("connectivity");
    expect(desc.status).toBe(503);
  });

  it("classifies config error from pg auth failure", () => {
    const err = { code: "28P01", message: "password authentication failed" };
    const desc = describeDatabaseError(err);
    expect(desc.kind).toBe("configuration");
  });

  it("classifies query error from duplicate key code", () => {
    const err = { code: "23505", message: "unique constraint violated" };
    const desc = describeDatabaseError(err);
    expect(desc.kind).toBe("query");
  });

  it("classifies connectivity from timeout message", () => {
    const err = new Error("Connection timeout after 5000ms");
    const desc = describeDatabaseError(err);
    expect(desc.kind).toBe("connectivity");
  });

  it("falls back to query kind for unknown errors", () => {
    const err = new Error("something weird happened");
    const desc = describeDatabaseError(err);
    expect(desc.kind).toBe("query");
  });
});

describe("wrapDatabaseError", () => {
  it("passes through existing DatabaseOperationError", () => {
    const original = new DatabaseOperationError({ operation: "x", kind: "query", status: 500, message: "m", troubleshooting: "t" });
    const wrapped = wrapDatabaseError("new.op", original);
    expect(wrapped).toBe(original);
  });

  it("wraps plain error in DatabaseOperationError", () => {
    const plain = new Error("connection reset");
    const wrapped = wrapDatabaseError("test.op", plain, { slug: "demo" });
    expect(wrapped).toBeInstanceOf(DatabaseOperationError);
    expect(wrapped.operation).toBe("test.op");
    expect(wrapped.context).toEqual({ slug: "demo" });
  });

  it("wraps non-Error values", () => {
    const wrapped = wrapDatabaseError("test.op", "string error");
    expect(wrapped).toBeInstanceOf(DatabaseOperationError);
  });
});

describe("runDatabaseOperation", () => {
  it("returns handler result on success", async () => {
    const result = await runDatabaseOperation({
      operation: "test.op",
      handler: async () => 42,
    });
    expect(result).toBe(42);
  });

  it("wraps thrown errors in DatabaseOperationError", async () => {
    await expect(
      runDatabaseOperation({
        operation: "test.op",
        handler: async () => {
          throw new Error("query failed");
        },
      }),
    ).rejects.toBeInstanceOf(DatabaseOperationError);
  });

  it("re-wraps already-wrapped DatabaseOperationError transparently", async () => {
    const original = new DatabaseOperationError({ operation: "inner", kind: "query", status: 500, message: "m", troubleshooting: "t" });
    const thrown = await runDatabaseOperation({
      operation: "outer",
      handler: async () => {
        throw original;
      },
    }).catch((e) => e);
    expect(thrown).toBe(original);
  });
});
