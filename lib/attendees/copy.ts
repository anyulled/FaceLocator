import type { EnrollmentStatus, EnrollmentUiState } from "@/lib/attendees/contracts";

export const ENROLLMENT_COPY = {
  consentLabel:
    "I consent to FaceLocator using this selfie for facial matching against event photos and later delivery of matched photos.",
  fileHelpText: "Choose a recent selfie with a clear view of your face.",
  formEyebrow: "Selfie enrollment",
  submitButtonIdle: "Register my selfie",
  submitButtonBusy: "Processing enrollment...",
  genericFailure:
    "We hit an unexpected problem while processing your enrollment.",
  states: {
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
  } satisfies Record<EnrollmentUiState, string>,
  status: {
    UPLOAD_PENDING: "Your registration was created. Selfie upload can start now.",
    UPLOADING: "Uploading your selfie now.",
    PROCESSING: "We are checking your selfie and preparing enrollment.",
    ENROLLED: "Your selfie has been registered.",
    FAILED: "We hit a snag while processing your registration.",
    CANCELLED: "This registration is no longer active.",
  } satisfies Record<EnrollmentStatus, string>,
} as const;

export function getEnrollmentStateCopy(state: EnrollmentUiState) {
  return ENROLLMENT_COPY.states[state];
}

export function getEnrollmentStatusCopy(status: EnrollmentStatus) {
  return ENROLLMENT_COPY.status[status];
}
