import { describe, expect, it } from "vitest";

import {
  AttendeeApiError,
  createApiError,
  errorResponse,
  toApiErrorResponse,
} from "@/lib/attendees/errors";

describe("attendee errors", () => {
  it("creates typed API errors", () => {
    const error = createApiError(400, "INVALID_EMAIL", "Email is invalid.", "email");

    expect(error).toBeInstanceOf(AttendeeApiError);
    expect(error).toMatchObject({
      status: 400,
      code: "INVALID_EMAIL",
      message: "Email is invalid.",
      field: "email",
    });
  });

  it("maps typed errors into stable API responses", () => {
    const payload = toApiErrorResponse(
      createApiError(422, "FILE_TOO_LARGE", "The file is too large.", "selfie"),
    );

    expect(payload).toEqual({
      error: {
        code: "FILE_TOO_LARGE",
        message: "The file is too large.",
        field: "selfie",
      },
    });
  });

  it("falls back to a safe internal error response for unknown errors", async () => {
    const response = errorResponse(new Error("kaboom"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong while processing the enrollment request.",
      },
    });
  });
});
