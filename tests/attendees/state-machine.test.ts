import { describe, expect, it } from "vitest";

import {
  getEnrollmentStateMessage,
  enrollmentInitialState,
  transitionEnrollmentState,
} from "@/lib/attendees/state-machine";

describe("enrollment state machine", () => {
  it("follows the happy path through enrollment", () => {
    const validating = transitionEnrollmentState(enrollmentInitialState, {
      type: "VALIDATE",
    });
    const readyToUpload = transitionEnrollmentState(validating, {
      type: "REGISTRATION_CREATED",
    });
    const uploading = transitionEnrollmentState(readyToUpload, {
      type: "UPLOAD_STARTED",
    });
    const uploadConfirmed = transitionEnrollmentState(uploading, {
      type: "UPLOAD_FINISHED",
    });
    const processing = transitionEnrollmentState(uploadConfirmed, {
      type: "STATUS_PENDING",
    });
    const enrolled = transitionEnrollmentState(processing, {
      type: "STATUS_ENROLLED",
    });

    expect(validating.value).toBe("VALIDATING");
    expect(readyToUpload.value).toBe("READY_TO_UPLOAD");
    expect(uploading.value).toBe("UPLOADING");
    expect(uploadConfirmed.value).toBe("UPLOAD_CONFIRMED");
    expect(processing.value).toBe("PROCESSING");
    expect(enrolled.value).toBe("ENROLLED");
  });

  it("ignores impossible transitions and allows reset from terminal states", () => {
    const reset = transitionEnrollmentState({ value: "FAILED" }, { type: "RESET" });

    expect(reset.value).toBe("IDLE");
  });

  it("rejects impossible transitions explicitly", () => {
    expect(() =>
      transitionEnrollmentState(enrollmentInitialState, {
        type: "UPLOAD_STARTED",
      }),
    ).toThrow("Invalid enrollment transition");
  });

  it("returns state-driven copy for the current UI state", () => {
    expect(getEnrollmentStateMessage({ value: "READY_TO_UPLOAD" })).toBe(
      "Registration created. Uploading your selfie now.",
    );
  });
});
