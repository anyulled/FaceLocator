export const ADMIN_MAX_PAGE_SIZE = 100;
export const ADMIN_DEFAULT_PAGE_SIZE = 30;

export type CreateEventInput = {
  title: string;
  slug: string;
  venue: string;
  description: string;
  startsAt: string;
  endsAt: string;
  logoObjectKey?: string;
};

export type PaginationQuery = {
  page: number;
  pageSize: number;
};

export type BatchDeletePhotosInput = {
  photoIds: string[];
};

export type AdminPhotoPresignInput = {
  contentType: string;
  fileSizeBytes?: number;
};

export type AdminPhotoPresignResponse = {
  event: {
    id: string;
    slug: string;
  };
  photo: {
    photoId: string;
    objectKey: string;
    uploadedBy: string;
  };
  upload: {
    method: "PUT";
    url: string;
    headers: Record<string, string>;
    objectKey: string;
    expiresAt: string;
  };
};

export type ValidationResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
    };

export type AdminEventSummary = {
  id: string;
  slug: string;
  title: string;
  venue: string;
  description: string;
  startsAt: string;
  endsAt: string;
  logoObjectKey?: string;
  photoCount: number;
};

export type AdminEventPhoto = {
  id: string;
  eventId: string;
  eventSlug: string;
  objectKey: string;
  status: string;
  uploadedAt: string;
  previewUrl: string | null;
};

export type AdminEventFaceMatch = {
  attendeeId: string;
  attendeeName: string;
  attendeeEmail: string;
  faceEnrollmentId: string;
  faceId: string;
  matchedPhotoCount: number;
  lastMatchedAt: string;
};

export type AdminEventFaceMatchSummary = {
  totalMatchedFaces: number;
  matchedFaces: AdminEventFaceMatch[];
};

export type AdminEventPhotosPage = {
  photos: AdminEventPhoto[];
  faceMatchSummary: AdminEventFaceMatchSummary;
  page: number;
  pageSize: number;
  totalCount: number;
};

export type PhotoDeleteResult = {
  photoId: string;
  status: "deleted" | "not_found" | "failed";
  message?: string;
};

export type BatchDeleteSummary = {
  results: PhotoDeleteResult[];
  deleted: number;
  notFound: number;
  failed: number;
};

function isSafeSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value);
}

function isIsoDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && value.includes("T");
}

function readPositiveInt(value: string | null | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

export function parsePaginationQuery(input: {
  page: string | null | undefined;
  pageSize: string | null | undefined;
}): ValidationResult<PaginationQuery> {
  return {
    success: true,
    data: {
      page: readPositiveInt(input.page, 1),
      pageSize: Math.min(ADMIN_MAX_PAGE_SIZE, readPositiveInt(input.pageSize, ADMIN_DEFAULT_PAGE_SIZE)),
    },
  };
}

export function parseCreateEventInput(payload: unknown): ValidationResult<CreateEventInput> {
  if (!payload || typeof payload !== "object") {
    return { success: false, error: "Payload must be an object" };
  }

  const candidate = payload as Record<string, unknown>;
  const title = String(candidate.title || "").trim();
  const slug = String(candidate.slug || "").trim().toLowerCase();
  const venue = String(candidate.venue || "").trim();
  const description = String(candidate.description || "").trim();
  const startsAt = String(candidate.startsAt || "").trim();
  const endsAt = String(candidate.endsAt || "").trim();
  const logoObjectKeyRaw = candidate.logoObjectKey;
  const logoObjectKey =
    typeof logoObjectKeyRaw === "string" && logoObjectKeyRaw.trim().length > 0
      ? logoObjectKeyRaw.trim()
      : undefined;

  if (title.length < 2 || title.length > 140) {
    return { success: false, error: "Title must be between 2 and 140 characters" };
  }

  if (!isSafeSlug(slug) || slug.length < 2 || slug.length > 80) {
    return { success: false, error: "Slug must be URL-safe (letters, numbers, hyphens)" };
  }

  if (venue.length < 2 || venue.length > 160) {
    return { success: false, error: "Venue must be between 2 and 160 characters" };
  }

  if (description.length < 4 || description.length > 1200) {
    return { success: false, error: "Description must be between 4 and 1200 characters" };
  }

  if (!isIsoDate(startsAt) || !isIsoDate(endsAt)) {
    return { success: false, error: "Start and end dates must be valid ISO datetimes" };
  }

  if (new Date(endsAt) <= new Date(startsAt)) {
    return { success: false, error: "End date must be after start date" };
  }

  return {
    success: true,
    data: {
      title,
      slug,
      venue,
      description,
      startsAt,
      endsAt,
      logoObjectKey,
    },
  };
}

export function parseBatchDeleteInput(payload: unknown): ValidationResult<BatchDeletePhotosInput> {
  if (!payload || typeof payload !== "object") {
    return { success: false, error: "Payload must be an object" };
  }

  const rawIds = (payload as Record<string, unknown>).photoIds;
  if (!Array.isArray(rawIds)) {
    return { success: false, error: "photoIds must be an array" };
  }

  const photoIds = Array.from(new Set(rawIds.map((item) => String(item).trim()).filter(Boolean)));

  if (photoIds.length === 0) {
    return { success: false, error: "Select at least one photo" };
  }

  if (photoIds.length > ADMIN_MAX_PAGE_SIZE) {
    return {
      success: false,
      error: `You can delete up to ${ADMIN_MAX_PAGE_SIZE} photos per request`,
    };
  }

  return {
    success: true,
    data: { photoIds },
  };
}

export function parseAdminPhotoPresignInput(payload: unknown): ValidationResult<AdminPhotoPresignInput> {
  if (!payload || typeof payload !== "object") {
    return { success: false, error: "Payload must be an object" };
  }

  const candidate = payload as Record<string, unknown>;
  const contentType = String(candidate.contentType || "").trim().toLowerCase();
  const rawFileSize = candidate.fileSizeBytes;
  const fileSizeBytes =
    typeof rawFileSize === "number" && Number.isFinite(rawFileSize) && rawFileSize >= 0
      ? Math.floor(rawFileSize)
      : undefined;

  if (contentType !== "image/jpeg") {
    return { success: false, error: "Only image/jpeg uploads are supported" };
  }

  return {
    success: true,
    data: {
      contentType,
      fileSizeBytes,
    },
  };
}
