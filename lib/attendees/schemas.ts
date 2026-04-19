import type {
  ApiErrorCode,
  ApiErrorField,
  RegistrationCompleteRequest,
  RegistrationIntentRequest,
} from "@/lib/attendees/contracts";
import { createApiError } from "@/lib/attendees/errors";

export const NAME_LENGTH_RANGE = {
  min: 2,
  max: 120,
} as const;
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_NAME_LENGTH = 180;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const SELFIE_FILE_ACCEPT = ALLOWED_IMAGE_TYPES.join(",");

export type ValidationIssue = {
  code: ApiErrorCode;
  message: string;
  field?: ApiErrorField;
};

export function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeFileName(value: string) {
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(input: Record<string, unknown>, key: string) {
  return typeof input[key] === "string" ? input[key] : "";
}

function createValidationIssue(
  code: ApiErrorCode,
  message: string,
  field?: ApiErrorField,
): ValidationIssue {
  return { code, message, field };
}

function normalizeRegistrationIntentDraft(
  input: unknown,
): RegistrationIntentRequest | null {
  if (!isRecord(input)) {
    return null;
  }

  const submissionKeyValue = getString(input, "submissionKey").trim();

  return {
    eventSlug: getString(input, "eventSlug").trim(),
    name: normalizeName(getString(input, "name")),
    email: normalizeEmail(getString(input, "email")),
    contentType: getString(input, "contentType").trim(),
    fileName: normalizeFileName(getString(input, "fileName")),
    fileSizeBytes:
      typeof input.fileSizeBytes === "number" ? input.fileSizeBytes : Number.NaN,
    consentAccepted: input.consentAccepted === true,
    submissionKey: submissionKeyValue.length > 0 ? submissionKeyValue : undefined,
  };
}

function normalizeRegistrationCompleteDraft(
  input: unknown,
): RegistrationCompleteRequest | null {
  if (!isRecord(input)) {
    return null;
  }

  return {
    registrationId: getString(input, "registrationId").trim(),
    uploadCompletedAt: getString(input, "uploadCompletedAt").trim(),
  };
}

export function getRegistrationIntentValidationIssues(
  input: unknown,
): ValidationIssue[] {
  const normalized = normalizeRegistrationIntentDraft(input);
  if (!normalized) {
    return [
      createValidationIssue(
        "INTERNAL_ERROR",
        "Request body must be a JSON object.",
      ),
    ];
  }

  const issues: ValidationIssue[] = [];

  if (!normalized.eventSlug) {
    issues.push(createValidationIssue("INVALID_EVENT", "Event slug is required."));
  }

  if (
    normalized.name.length < NAME_LENGTH_RANGE.min ||
    normalized.name.length > NAME_LENGTH_RANGE.max
  ) {
    issues.push(
      createValidationIssue("INVALID_NAME", "Please enter your full name.", "name"),
    );
  }

  if (
    !normalized.email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)
  ) {
    issues.push(
      createValidationIssue("INVALID_EMAIL", "Email address is invalid.", "email"),
    );
  }

  if (!normalized.consentAccepted) {
    issues.push(
      createValidationIssue(
        "CONSENT_REQUIRED",
        "Consent is required.",
        "consentAccepted",
      ),
    );
  }

  if (!normalized.fileName) {
    issues.push(
      createValidationIssue(
        "MISSING_FILE",
        "Please select a selfie to upload.",
        "selfie",
      ),
    );
  } else if (normalized.fileName.length > MAX_FILE_NAME_LENGTH) {
    issues.push(
      createValidationIssue(
        "MISSING_FILE",
        "The selected file name is too long.",
        "selfie",
      ),
    );
  }

  if (
    !ALLOWED_IMAGE_TYPES.includes(
      normalized.contentType as (typeof ALLOWED_IMAGE_TYPES)[number],
    )
  ) {
    issues.push(
      createValidationIssue(
        "UNSUPPORTED_CONTENT_TYPE",
        "Only JPEG, PNG, and WEBP images are supported.",
        "selfie",
      ),
    );
  }

  if (
    !Number.isInteger(normalized.fileSizeBytes) ||
    normalized.fileSizeBytes <= 0 ||
    normalized.fileSizeBytes > MAX_FILE_SIZE_BYTES
  ) {
    issues.push(
      createValidationIssue(
        "FILE_TOO_LARGE",
        "The selected file is too large.",
        "selfie",
      ),
    );
  }

  return issues;
}

export function validateRegistrationIntentRequest(
  input: unknown,
): RegistrationIntentRequest {
  const normalized = normalizeRegistrationIntentDraft(input);
  if (!normalized) {
    throw createApiError(400, "INTERNAL_ERROR", "Request body must be a JSON object.");
  }

  const [firstIssue] = getRegistrationIntentValidationIssues(normalized);
  if (firstIssue) {
    const status =
      firstIssue.code === "UNSUPPORTED_CONTENT_TYPE" ||
      firstIssue.code === "FILE_TOO_LARGE"
        ? 422
        : 400;
    throw createApiError(status, firstIssue.code, firstIssue.message, firstIssue.field);
  }

  return normalized;
}

export function getRegistrationCompleteValidationIssues(
  input: unknown,
): ValidationIssue[] {
  const normalized = normalizeRegistrationCompleteDraft(input);
  if (!normalized) {
    return [
      createValidationIssue(
        "INTERNAL_ERROR",
        "Request body must be a JSON object.",
      ),
    ];
  }

  const issues: ValidationIssue[] = [];

  if (!normalized.registrationId) {
    issues.push(
      createValidationIssue(
        "REGISTRATION_NOT_FOUND",
        "Registration id is required.",
      ),
    );
  }

  if (
    !normalized.uploadCompletedAt ||
    Number.isNaN(Date.parse(normalized.uploadCompletedAt))
  ) {
    issues.push(
      createValidationIssue(
        "INTERNAL_ERROR",
        "Upload completion timestamp is invalid.",
      ),
    );
  }

  return issues;
}

export function validateRegistrationCompleteRequest(
  input: unknown,
): RegistrationCompleteRequest {
  const normalized = normalizeRegistrationCompleteDraft(input);
  if (!normalized) {
    throw createApiError(400, "INTERNAL_ERROR", "Request body must be a JSON object.");
  }

  const [firstIssue] = getRegistrationCompleteValidationIssues(normalized);
  if (firstIssue) {
    throw createApiError(400, firstIssue.code, firstIssue.message, firstIssue.field);
  }

  return normalized;
}
