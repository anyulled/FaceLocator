import { describe, expect, it } from "vitest";
import { wrapDatabaseError } from "@/lib/aws/database-errors";

describe("database-errors", () => {
  it("summarizes non-object cause", () => {
    const error = wrapDatabaseError("test-op", "string error");
    expect(error.details.message).toBe("string error");
  });

  it("summarizes object cause with various fields", () => {
    const cause = {
      name: "PgError",
      message: "fail",
      code: "123",
      errno: 1,
      syscall: "connect",
      address: "127.0.0.1",
      port: 5432,
    };
    const error = wrapDatabaseError("test-op", cause);
    expect(error.details).toMatchObject(cause);
  });

  it("classifies connectivity errors", () => {
    const error = wrapDatabaseError("test-op", { code: "ECONNREFUSED" });
    expect(error.status).toBe(503);
    expect(error.message).toContain("connection failed");
  });

  it("classifies authentication errors", () => {
    const error = wrapDatabaseError("test-op", { code: "28P01" });
    expect(error.status).toBe(500);
    expect(error.message).toContain("configuration");
  });
  it("summarizes non-object Error cause", () => {
    const error = wrapDatabaseError("test-op", new Error("error object"));
    expect(error.details.message).toBe("error object");
  });

  it("classifies missing role errors", () => {
    const error = wrapDatabaseError("test-op", "role 'admin' does not exist");
    expect(error.status).toBe(500);
    expect(error.message).toContain("configuration");
  });
});
