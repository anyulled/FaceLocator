export const AWS_POC_CONSENT_TEXT_VERSION = "2026-04-19";
export const AWS_POC_MINIMUM_CONSENT_TEXT =
  "I consent to FaceLocator using my selfie for facial matching against event photos and for later delivery of matched photos.";

export const SELFIE_UPLOAD_METADATA_FIELDS = [
  "event-id",
  "attendee-id",
  "registration-id",
  "consent-version",
] as const;

export const EVENT_PHOTO_UPLOAD_METADATA_FIELDS = [
  "event-id",
  "photo-id",
  "uploaded-by",
] as const;

export const NEXTJS_AWS_ENV_VARS = [
  "AWS_REGION",
  "FACE_LOCATOR_SELFIES_BUCKET",
  "FACE_LOCATOR_EVENT_PHOTOS_BUCKET",
  "FACE_LOCATOR_PUBLIC_BASE_URL",
  "FACE_LOCATOR_SELFIE_KEY_PREFIX",
  "FACE_LOCATOR_EVENT_PHOTO_PENDING_PREFIX",
  "FACE_LOCATOR_AWS_UPLOAD_MODE",
  "ADMIN_READ_BACKEND",
  "ADMIN_WRITE_BACKEND",
  "FACE_LOCATOR_ADMIN_READ_LAMBDA_NAME",
  "FACE_LOCATOR_ADMIN_WRITE_EVENTS_LAMBDA_NAME",
  "FACE_LOCATOR_ADMIN_WRITE_PHOTOS_LAMBDA_NAME",
  "MATCH_LINK_SIGNING_SECRET",
  "MATCH_LINK_TTL_DAYS",
  "SES_FROM_EMAIL",
  "FACE_LOCATOR_DATABASE_SECRET",
  "FACE_LOCATOR_DATABASE_SECRET_NAME",
  "FACE_LOCATOR_DATABASE_SECRET_ARN",
  "DATABASE_SECRET_NAME",
  "DATABASE_SECRET_ARN",
] as const;

function sanitizeSegment(value: string) {
  return value.trim().replace(/\s+/g, "-").toLowerCase();
}

export function buildSelfieObjectKey(input: {
  eventId: string;
  attendeeId: string;
  fileName: string;
}) {
  return `events/${sanitizeSegment(input.eventId)}/attendees/${sanitizeSegment(
    input.attendeeId,
  )}/${sanitizeSegment(input.fileName)}`;
}

export function buildEventPhotoPendingObjectKey(input: {
  eventId: string;
  photoId: string;
  extension?: string;
}) {
  const extension = input.extension?.replace(/^\./, "").toLowerCase() || "jpg";
  return `events/pending/${sanitizeSegment(input.eventId)}/photos/${sanitizeSegment(
    input.photoId,
  )}.${extension}`;
}

export function parseSelfieObjectKey(key: string) {
  const match = key.match(/^events\/([^/]+)\/attendees\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return null;
  }

  return {
    eventId: match[1],
    attendeeId: match[2],
    fileName: match[3],
  };
}

export function parseEventPhotoPendingObjectKey(key: string) {
  const match = key.match(/^events\/pending\/([^/]+)\/photos\/([^/]+)$/);
  if (!match) {
    return null;
  }

  return {
    eventId: match[1],
    fileName: match[2],
  };
}
