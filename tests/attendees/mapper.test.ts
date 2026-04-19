import { describe, expect, it } from "vitest";

import { getStatusCopy, getStatusHeadline, mapApiErrorToFieldErrors } from "@/lib/attendees/mapper";

describe("attendee mapper", () => {
  it("maps field-level API errors into form errors", () => {
    expect(
      mapApiErrorToFieldErrors({
        code: "INVALID_EMAIL",
        message: "Email address is invalid.",
        field: "email",
      }),
    ).toEqual({
      email: "Email address is invalid.",
    });
  });

  it("returns an empty object for non-field errors", () => {
    expect(
      mapApiErrorToFieldErrors({
        code: "INTERNAL_ERROR",
        message: "Something went wrong.",
      }),
    ).toEqual({});
  });

  it("returns deterministic copy for status helpers", () => {
    expect(getStatusCopy("PROCESSING")).toContain("preparing enrollment");
    expect(
      getStatusHeadline({
        registrationId: "reg_123",
        status: "ENROLLED",
        message: "ignored in favor of catalog helper",
      }),
    ).toBe("Your selfie has been registered.");
  });
});
