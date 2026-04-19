import type { EnrollmentUiState } from "@/lib/attendees/contracts";

export type EnrollmentMachineState = {
  value: EnrollmentUiState;
};

export type EnrollmentMachineEvent =
  | { type: "VALIDATE" }
  | { type: "VALIDATION_FAILED" }
  | { type: "REGISTRATION_CREATED" }
  | { type: "UPLOAD_STARTED" }
  | { type: "UPLOAD_FINISHED" }
  | { type: "STATUS_PENDING" }
  | { type: "STATUS_ENROLLED" }
  | { type: "FAIL" }
  | { type: "RESET" };

const transitions: Record<
  EnrollmentUiState,
  Partial<Record<EnrollmentMachineEvent["type"], EnrollmentUiState>>
> = {
  IDLE: {
    VALIDATE: "VALIDATING",
  },
  VALIDATING: {
    VALIDATION_FAILED: "FAILED",
    REGISTRATION_CREATED: "READY_TO_UPLOAD",
    FAIL: "FAILED",
  },
  CREATING_REGISTRATION: {
    REGISTRATION_CREATED: "READY_TO_UPLOAD",
    FAIL: "FAILED",
  },
  READY_TO_UPLOAD: {
    UPLOAD_STARTED: "UPLOADING",
    FAIL: "FAILED",
  },
  UPLOADING: {
    UPLOAD_FINISHED: "UPLOAD_CONFIRMED",
    FAIL: "FAILED",
  },
  UPLOAD_CONFIRMED: {
    STATUS_PENDING: "PROCESSING",
    FAIL: "FAILED",
  },
  PROCESSING: {
    STATUS_ENROLLED: "ENROLLED",
    FAIL: "FAILED",
  },
  ENROLLED: {
    RESET: "IDLE",
  },
  FAILED: {
    RESET: "IDLE",
  },
};

export const enrollmentInitialState: EnrollmentMachineState = {
  value: "IDLE",
};

export function transitionEnrollmentState(
  current: EnrollmentMachineState,
  event: EnrollmentMachineEvent,
): EnrollmentMachineState {
  if (current.value === "IDLE" && event.type === "REGISTRATION_CREATED") {
    return { value: "READY_TO_UPLOAD" };
  }

  const next = transitions[current.value][event.type];
  if (!next) {
    return current;
  }

  return { value: next };
}
