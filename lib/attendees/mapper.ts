import type {
  ApiErrorField,
  ApiErrorResponse,
  EnrollmentStatus,
  RegistrationStatusResponse,
} from "@/lib/attendees/contracts";
import { getEnrollmentStatusCopy } from "@/lib/attendees/copy";

export function mapApiErrorToFieldErrors(error: ApiErrorResponse["error"]) {
  if (!error.field) {
    return {};
  }

  return {
    [error.field]: error.message,
  } as Partial<Record<ApiErrorField, string>>;
}

export function getStatusCopy(status: EnrollmentStatus) {
  return getEnrollmentStatusCopy(status);
}

export function getStatusHeadline(statusResponse: RegistrationStatusResponse) {
  return getStatusCopy(statusResponse.status);
}
