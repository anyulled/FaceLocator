import type {
  RegistrationCompleteRequest,
  RegistrationIntentRequest,
} from "@/lib/attendees/contracts";
import { createApiError } from "@/lib/attendees/errors";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateRegistrationIntentRequest(
  input: unknown,
): RegistrationIntentRequest {
  if (!isRecord(input)) {
    throw createApiError(400, "INTERNAL_ERROR", "Request body must be a JSON object.");
  }

  const eventSlug = typeof input.eventSlug === "string" ? input.eventSlug.trim() : "";
  const name = typeof input.name === "string" ? normalizeName(input.name) : "";
  const email = typeof input.email === "string" ? normalizeEmail(input.email) : "";
  const contentType = typeof input.contentType === "string" ? input.contentType.trim() : "";
  const fileName = typeof input.fileName === "string" ? input.fileName.trim() : "";
  const fileSizeBytes = typeof input.fileSizeBytes === "number" ? input.fileSizeBytes : Number.NaN;
  const consentAccepted = input.consentAccepted === true;
  const submissionKey =
    typeof input.submissionKey === "string" && input.submissionKey.trim().length > 0
      ? input.submissionKey.trim()
      : undefined;

  if (!eventSlug) {
    throw createApiError(400, "INVALID_EVENT", "Event slug is required.");
  }

  if (name.length < 2 || name.length > 120) {
    throw createApiError(400, "INVALID_NAME", "Please enter your full name.", "name");
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createApiError(400, "INVALID_EMAIL", "Email address is invalid.", "email");
  }

  if (!consentAccepted) {
    throw createApiError(400, "CONSENT_REQUIRED", "Consent is required.", "consentAccepted");
  }

  if (!fileName) {
    throw createApiError(400, "MISSING_FILE", "Please select a selfie to upload.", "selfie");
  }

  if (!ALLOWED_IMAGE_TYPES.includes(contentType as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    throw createApiError(
      422,
      "UNSUPPORTED_CONTENT_TYPE",
      "Only JPEG, PNG, and WEBP images are supported.",
      "selfie",
    );
  }

  if (!Number.isInteger(fileSizeBytes) || fileSizeBytes <= 0 || fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    throw createApiError(422, "FILE_TOO_LARGE", "The selected file is too large.", "selfie");
  }

  return {
    eventSlug,
    name,
    email,
    contentType,
    fileName,
    fileSizeBytes,
    consentAccepted,
    submissionKey,
  };
}

export function validateRegistrationCompleteRequest(
  input: unknown,
): RegistrationCompleteRequest {
  if (!isRecord(input)) {
    throw createApiError(400, "INTERNAL_ERROR", "Request body must be a JSON object.");
  }

  const registrationId =
    typeof input.registrationId === "string" ? input.registrationId.trim() : "";
  const uploadCompletedAt =
    typeof input.uploadCompletedAt === "string" ? input.uploadCompletedAt.trim() : "";

  if (!registrationId) {
    throw createApiError(400, "REGISTRATION_NOT_FOUND", "Registration id is required.");
  }

  if (!uploadCompletedAt || Number.isNaN(Date.parse(uploadCompletedAt))) {
    throw createApiError(400, "INTERNAL_ERROR", "Upload completion timestamp is invalid.");
  }

  return {
    registrationId,
    uploadCompletedAt,
  };
}
