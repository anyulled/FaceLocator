import { describe, expect, it } from "vitest";

import {
  enrollmentInitialState,
  transitionEnrollmentState,
} from "@/lib/attendees/state-machine";

describe("enrollment state machine", () => {
  it("follows the happy path through enrollment", () => {
    const readyToUpload = transitionEnrollmentState(enrollmentInitialState, {
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

    expect(readyToUpload.value).toBe("READY_TO_UPLOAD");
    expect(uploading.value).toBe("UPLOADING");
    expect(uploadConfirmed.value).toBe("UPLOAD_CONFIRMED");
    expect(processing.value).toBe("PROCESSING");
    expect(enrolled.value).toBe("ENROLLED");
  });
});
