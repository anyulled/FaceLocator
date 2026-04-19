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

const stateMessages: Record<EnrollmentUiState, string> = {
  IDLE: "Complete the form and upload a recent selfie to begin enrollment.",
  VALIDATING: "Checking your details before we start the registration flow.",
  CREATING_REGISTRATION:
    "Creating your registration and reserving the upload slot.",
  READY_TO_UPLOAD: "Registration created. Uploading your selfie now.",
  UPLOADING: "Uploading your selfie now.",
  UPLOAD_CONFIRMED: "Upload complete. Confirming registration with the server.",
  PROCESSING: "Your selfie is being processed now.",
  ENROLLED: "Your selfie has been registered.",
  FAILED: "We hit an unexpected problem while processing your enrollment.",
};

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

export function getEnrollmentStateMessage(state: EnrollmentMachineState) {
  return stateMessages[state.value];
}

export function transitionEnrollmentState(
  current: EnrollmentMachineState,
  event: EnrollmentMachineEvent,
): EnrollmentMachineState {
  const next = transitions[current.value][event.type];
  if (!next) {
    throw new Error(
      `Invalid enrollment transition: ${current.value} -> ${event.type}`,
    );
  }

  return { value: next };
}
