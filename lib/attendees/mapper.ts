import type {
  ApiErrorResponse,
  EnrollmentStatus,
  RegistrationStatusResponse,
} from "@/lib/attendees/contracts";

export function mapApiErrorToFieldErrors(error: ApiErrorResponse["error"]) {
  if (!error.field) {
    return {};
  }

  return {
    [error.field]: error.message,
  };
}

export function getStatusCopy(status: EnrollmentStatus) {
  switch (status) {
    case "UPLOAD_PENDING":
      return "Your registration was created. Selfie upload can start now.";
    case "UPLOADING":
      return "Uploading your selfie now.";
    case "PROCESSING":
      return "We are checking your selfie and preparing enrollment.";
    case "ENROLLED":
      return "Your selfie has been registered.";
    case "FAILED":
      return "We hit a snag while processing your registration.";
    case "CANCELLED":
      return "This registration is no longer active.";
  }
}

export function getStatusHeadline(statusResponse: RegistrationStatusResponse) {
  return getStatusCopy(statusResponse.status);
}
