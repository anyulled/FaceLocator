export const ENROLLMENT_STATUSES = [
  "UPLOAD_PENDING",
  "UPLOADING",
  "PROCESSING",
  "ENROLLED",
  "FAILED",
  "CANCELLED",
] as const;

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const API_ERROR_FIELDS = [
  "name",
  "email",
  "consentAccepted",
  "selfie",
] as const;

export type ApiErrorField = (typeof API_ERROR_FIELDS)[number];

export type EnrollmentUiState =
  | "IDLE"
  | "VALIDATING"
  | "CREATING_REGISTRATION"
  | "READY_TO_UPLOAD"
  | "UPLOADING"
  | "UPLOAD_CONFIRMED"
  | "PROCESSING"
  | "ENROLLED"
  | "FAILED";

export type ApiErrorCode =
  | "INVALID_EVENT"
  | "INVALID_NAME"
  | "INVALID_EMAIL"
  | "MISSING_FILE"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "FILE_TOO_LARGE"
  | "CONSENT_REQUIRED"
  | "DUPLICATE_REGISTRATION"
  | "RATE_LIMITED"
  | "REGISTRATION_NOT_FOUND"
  | "INTERNAL_ERROR";

export type UploadInstructions = {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  objectKey: string;
  expiresAt: string;
};

export type RegistrationIntentRequest = {
  eventSlug: string;
  name: string;
  email: string;
  contentType: string;
  fileName: string;
  fileSizeBytes: number;
  consentAccepted: boolean;
  submissionKey?: string;
};

export type RegistrationIntentResponse = {
  registrationId: string;
  attendeeId: string;
  upload: UploadInstructions;
  status: "UPLOAD_PENDING";
};

export type RegistrationCompleteRequest = {
  registrationId: string;
  uploadCompletedAt: string;
};

export type RegistrationStatusResponse = {
  registrationId: string;
  status: EnrollmentStatus;
  message: string;
};

export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
    field?: ApiErrorField;
    correlationId?: string;
  };
};

export type EnrollmentEventSummary = {
  slug: string;
  title: string;
  venue: string;
  scheduledAt: string;
  endsAt?: string;
  description: string;
};
