import "server-only";

import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
  AdminEventFaceMatch,
  AdminEventPhotosPage,
  AdminEventSelfiesPage,
  AdminEventSummary,
  CreateEventInput,
  AdminPhotoPresignResponse,
} from "@/lib/admin/events/contracts";
import {
  createAdminEvent,
  createAdminEventPhotoUpload,
  listAdminEventSelfies,
  listAdminEvents,
} from "@/lib/admin/events/repository";
import { getDatabasePool } from "@/lib/aws/database";

export type AdminEventPhotoReprocessSummary = {
  eventSlug: string;
  total: number;
  queued: number;
  failed: number;
};

type AdminReadBackendErrorDetails = {
  operation: string;
  backend: "direct" | "lambda";
  lambdaName: string;
  response?: unknown;
};

const DEFAULT_EVENT_PHOTO_WORKER_LAMBDA_NAME = "face-locator-poc-event-photo-worker";
const DEFAULT_MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME = "face-locator-poc-matched-photo-notifier";
const PHOTO_PREVIEW_TTL_SECONDS = 60 * 10;
const PHOTO_PREVIEW_RESPONSE_CONTENT_TYPE = "image/jpeg";

let lambdaClient: LambdaClient | null = null;
let s3Client: S3Client | null = null;

export class AdminReadBackendError extends Error {
  public readonly statusCode: number;

  public readonly details: AdminReadBackendErrorDetails;

  constructor(message: string, statusCode: number, details?: AdminReadBackendErrorDetails) {
    super(message);
    this.name = "AdminReadBackendError";
    this.statusCode = statusCode;
    this.details = details ?? {
      operation: "unknown",
      backend: "direct",
      lambdaName: "",
    };
  }
}

function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

export function getMatchedPhotoNotifierLambdaName() {
  return (
    readEnv(
      "FACE_LOCATOR_MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME",
      "MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME",
    ) || DEFAULT_MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME
  );
}

export function getEventPhotoWorkerLambdaName() {
  return (
    readEnv(
      "FACE_LOCATOR_EVENT_PHOTO_WORKER_LAMBDA_NAME",
      "EVENT_PHOTO_WORKER_LAMBDA_NAME",
    ) || DEFAULT_EVENT_PHOTO_WORKER_LAMBDA_NAME
  );
}

function getLambdaClient() {
  lambdaClient ??= new LambdaClient({ region: process.env.AWS_REGION || "eu-west-1" });

  return lambdaClient;
}

function getS3Client() {
  s3Client ??= new S3Client({ region: process.env.AWS_REGION || "eu-west-1" });

  return s3Client;
}

function getEventPhotosBucketName() {
  const bucket = readEnv("FACE_LOCATOR_EVENT_PHOTOS_BUCKET");
  if (!bucket) {
    throw new Error("FACE_LOCATOR_EVENT_PHOTOS_BUCKET is required");
  }

  return bucket;
}

async function buildPreviewUrl(objectKey: string) {
  try {
    await getS3Client().send(
      new HeadObjectCommand({
        Bucket: getEventPhotosBucketName(),
        Key: objectKey,
      }),
    );

    return await getSignedUrl(
      getS3Client(),
      new GetObjectCommand({
        Bucket: getEventPhotosBucketName(),
        Key: objectKey,
        ResponseContentType: PHOTO_PREVIEW_RESPONSE_CONTENT_TYPE,
      }),
      { expiresIn: PHOTO_PREVIEW_TTL_SECONDS },
    );
  } catch {
    return null;
  }
}

export async function listAdminEventsViaBackend(input: {
  page: number;
  pageSize: number;
}): Promise<{
  events: AdminEventSummary[];
  totalCount: number;
}> {
  return listAdminEvents(input);
}

export async function createAdminEventViaBackend(input: CreateEventInput): Promise<AdminEventSummary> {
  return createAdminEvent(input);
}

export async function createAdminEventPhotoUploadViaBackend(input: {
  eventSlug: string;
  contentType: string;
  uploadedBy: string;
}): Promise<AdminPhotoPresignResponse | null> {
  return createAdminEventPhotoUpload(input);
}

export async function getAdminEventSelfiesPageViaBackend(input: {
  eventSlug: string;
  page: number;
  pageSize: number;
}): Promise<AdminEventSelfiesPage> {
  return listAdminEventSelfies(input);
}

export async function getAdminEventPhotosPageViaBackend(input: {
  eventSlug: string;
  page: number;
  pageSize: number;
}): Promise<AdminEventPhotosPage & {
  event: {
    id: string;
    slug: string;
    title: string;
    venue: string;
    description: string;
    startsAt: string;
    endsAt: string;
      logoObjectKey?: string;
  } | null;
}> {
  const pool = await getDatabasePool();
  const eventResult = await pool.query<{
    id: string;
    slug: string;
    title: string;
    venue: string | null;
    description: string | null;
    startsAt: string | null;
    endsAt: string | null;
    logoObjectKey: string | null;
  }>(
    `
      SELECT
        e.id,
        e.slug,
        e.title,
        e.venue,
        e.description,
        e.scheduled_at AS "startsAt",
        e.ends_at AS "endsAt",
        e.logo_object_key AS "logoObjectKey"
      FROM events e
      WHERE e.slug = $1
      LIMIT 1
    `,
    [input.eventSlug],
  );

  const event = eventResult.rows[0];
  if (!event) {
    return {
      event: null,
      photos: [],
      faceMatchSummary: {
        totalMatchedFaces: 0,
        totalRegisteredSelfies: 0,
        totalAssociatedUsers: 0,
        matchedFaces: [],
      },
      page: input.page,
      pageSize: input.pageSize,
      totalCount: 0,
    };
  }

  const offset = (input.page - 1) * input.pageSize;
  const [rowsRes, totalRes, faceMatchesRes, eventStatsRes] = await Promise.all([
    pool.query<{
      id: string;
      eventId: string;
      eventSlug: string;
      objectKey: string;
      status: string;
      uploadedAt: string;
    }>(
      `
        SELECT
          ep.id,
          ep.event_id AS "eventId",
          e.slug AS "eventSlug",
          ep.object_key AS "objectKey",
          ep.status,
          ep.uploaded_at AS "uploadedAt"
        FROM event_photos ep
        JOIN events e ON e.id = ep.event_id
        WHERE e.slug = $1
          AND ep.deleted_at IS NULL
        ORDER BY ep.uploaded_at DESC, ep.created_at DESC
        LIMIT $2 OFFSET $3
      `,
      [input.eventSlug, input.pageSize, offset],
    ),
    pool.query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM event_photos ep
        JOIN events e ON e.id = ep.event_id
        WHERE e.slug = $1
          AND ep.deleted_at IS NULL
      `,
      [input.eventSlug],
    ),
    pool.query<{
      attendeeId: string;
      attendeeName: string | null;
      attendeeEmail: string | null;
      faceEnrollmentId: string;
      faceId: string;
      matchedPhotoCount: number;
      lastMatchedAt: string | null;
    }>(
      `
        SELECT
          ea.attendee_id AS "attendeeId",
          a.name AS "attendeeName",
          a.email AS "attendeeEmail",
          latest_face.id AS "faceEnrollmentId",
          latest_face.rekognition_face_id AS "faceId",
          COUNT(DISTINCT m.event_photo_id)::int AS "matchedPhotoCount",
          COALESCE(MAX(m.created_at), MAX(ep.uploaded_at), MAX(ep.created_at)) AS "lastMatchedAt"
        FROM event_attendees ea
        JOIN attendees a
          ON a.id = ea.attendee_id
          JOIN LATERAL (
            SELECT fe.id, fe.rekognition_face_id
            FROM face_enrollments fe
            WHERE fe.event_id = ea.event_id
              AND fe.attendee_id = ea.attendee_id
              AND fe.deleted_at IS NULL
              AND fe.rekognition_face_id IS NOT NULL
            ORDER BY COALESCE(fe.enrolled_at, fe.created_at) DESC
            LIMIT 1
          ) latest_face ON true
          JOIN photo_face_matches m
            ON m.attendee_id = ea.attendee_id
          JOIN event_photos ep
            ON ep.id = m.event_photo_id
           AND ep.event_id = ea.event_id
           AND ep.deleted_at IS NULL
          WHERE ea.event_id = $1
            AND a.email IS NOT NULL
          GROUP BY
            ea.attendee_id,
            a.name,
            a.email,
            latest_face.id,
            latest_face.rekognition_face_id
        ORDER BY
          COUNT(DISTINCT m.event_photo_id) DESC,
          COALESCE(MAX(m.created_at), MAX(ep.uploaded_at), MAX(ep.created_at)) DESC,
          ea.attendee_id ASC
      `,
      [event.id],
    ),
    pool.query<{
      totalRegisteredSelfies: string;
      totalAssociatedUsers: string;
    }>(
      `
        SELECT
          (
            SELECT COUNT(*)::text
            FROM face_enrollments fe
            WHERE fe.event_id = $1
              AND fe.deleted_at IS NULL
              AND fe.status IN ('pending', 'processing', 'enrolled')
          ) AS "totalRegisteredSelfies",
          (
            SELECT COUNT(*)::text
            FROM event_attendees ea
            WHERE ea.event_id = $1
          ) AS "totalAssociatedUsers"
      `,
      [event.id],
    ),
  ]);

  const matchedFaces: AdminEventFaceMatch[] = faceMatchesRes.rows.map((row) => ({
    attendeeId: row.attendeeId,
    attendeeName: row.attendeeName ?? "Attendee",
    attendeeEmail: row.attendeeEmail ?? "",
    faceEnrollmentId: row.faceEnrollmentId,
    faceId: row.faceId,
    matchedPhotoCount: Number(row.matchedPhotoCount),
    lastMatchedAt: row.lastMatchedAt ?? new Date().toISOString(),
  }));

  return {
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      venue: event.venue ?? "",
      description: event.description ?? "",
      startsAt: event.startsAt ?? new Date(0).toISOString(),
      endsAt: event.endsAt ?? event.startsAt ?? new Date(0).toISOString(),
      logoObjectKey: event.logoObjectKey ?? undefined,
    },
    photos: await Promise.all(
      rowsRes.rows.map(async (row) => ({
        id: row.id,
        eventId: row.eventId,
        eventSlug: row.eventSlug,
        objectKey: row.objectKey,
        status: row.status,
        uploadedAt: row.uploadedAt,
        previewUrl: await buildPreviewUrl(row.objectKey),
      })),
    ),
    faceMatchSummary: {
      totalMatchedFaces: matchedFaces.length,
      totalRegisteredSelfies: Number(eventStatsRes.rows[0]?.totalRegisteredSelfies ?? "0"),
      totalAssociatedUsers: Number(eventStatsRes.rows[0]?.totalAssociatedUsers ?? "0"),
      matchedFaces,
    },
    page: input.page,
    pageSize: input.pageSize,
    totalCount: Number(totalRes.rows[0]?.total ?? "0"),
  };
}

export async function reprocessAdminEventPhotosViaBackend(input: {
  eventSlug: string;
}): Promise<AdminEventPhotoReprocessSummary | null> {
  const lambdaName = getEventPhotoWorkerLambdaName();
  const pool = await getDatabasePool();
  const eventRes = await pool.query<{ id: string }>(
    `
      SELECT e.id
      FROM events e
      WHERE e.slug = $1
      LIMIT 1
    `,
    [input.eventSlug],
  );

  const event = eventRes.rows[0];
  if (!event) {
    return null;
  }

  try {
    const response = await getLambdaClient().send(
      new InvokeCommand({
        FunctionName: lambdaName,
        InvocationType: "RequestResponse",
        Payload: Buffer.from(
          JSON.stringify({
            operation: "processReadyPhotos",
            eventSlug: input.eventSlug,
            eventId: event.id,
            forceReprocess: true,
            limit: 500,
          }),
        ),
      }),
    );

    const payloadText = response.Payload ? Buffer.from(response.Payload).toString("utf8") : "";
    const payload = payloadText ? JSON.parse(payloadText) : null;

    if (!payload) {
      throw new AdminReadBackendError(
        "Event photo worker returned an empty response. Check Lambda logs and invocation payload.",
        502,
        {
          operation: "processReadyPhotos",
          backend: "lambda",
          lambdaName,
        },
      );
    }

    if (typeof payload === "object" && payload !== null && "statusCode" in payload) {
      const statusCode = Number((payload as { statusCode?: unknown }).statusCode) || 500;
      const errorMessage =
        typeof (payload as { errorMessage?: unknown }).errorMessage === "string"
          ? (payload as { errorMessage: string }).errorMessage
          : "Event photo worker failed.";

      throw new AdminReadBackendError(errorMessage, statusCode, {
        operation: "processReadyPhotos",
        backend: "lambda",
        lambdaName,
        response: payload,
      });
    }

    return payload as AdminEventPhotoReprocessSummary;
  } catch (error) {
    if (error instanceof AdminReadBackendError) {
      throw error;
    }

    throw new AdminReadBackendError(
      "Event photo worker invocation failed. Check Lambda invoke permission, function name, and CloudWatch logs.",
      503,
      {
        operation: "processReadyPhotos",
        backend: "lambda",
        lambdaName,
        response:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
      },
    );
  }
}

export async function sendMatchedPhotoNotificationViaBackend(input: {
  eventSlug: string;
  attendeeId: string;
  forceResend?: boolean;
}): Promise<{
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
  reason?: string;
}> {
  const lambdaName = getMatchedPhotoNotifierLambdaName();

  try {
    const response = await getLambdaClient().send(
      new InvokeCommand({
        FunctionName: lambdaName,
        InvocationType: "RequestResponse",
        Payload: Buffer.from(
          JSON.stringify({
            operation: "sendSingleNotification",
            input: {
              eventSlug: input.eventSlug,
              attendeeId: input.attendeeId,
              forceResend: input.forceResend ?? true,
            },
          }),
        ),
      }),
    );

    const payloadText = response.Payload ? Buffer.from(response.Payload).toString("utf8") : "";
    const payload = payloadText ? JSON.parse(payloadText) : null;

    if (!payload) {
      throw new AdminReadBackendError(
        "Matched photo notifier returned an empty response. Check Lambda logs and invocation payload.",
        502,
        {
          operation: "sendSingleNotification",
          backend: "lambda",
          lambdaName,
        },
      );
    }

    if (typeof payload === "object" && payload !== null && "statusCode" in payload) {
      const statusCode = Number((payload as { statusCode?: unknown }).statusCode) || 500;
      const errorMessage =
        typeof (payload as { errorMessage?: unknown }).errorMessage === "string"
          ? (payload as { errorMessage: string }).errorMessage
          : "Matched photo notifier failed.";

      throw new AdminReadBackendError(errorMessage, statusCode, {
        operation: "sendSingleNotification",
        backend: "lambda",
        lambdaName,
        response: payload,
      });
    }

    return payload as {
      scanned: number;
      sent: number;
      skipped: number;
      failed: number;
      reason?: string;
    };
  } catch (error) {
    if (error instanceof AdminReadBackendError) {
      throw error;
    }

    throw new AdminReadBackendError(
      "Matched photo notifier invocation failed. Check Lambda invoke permission, function name, and CloudWatch logs.",
      503,
      {
        operation: "sendSingleNotification",
        backend: "lambda",
        lambdaName,
        response:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
      },
    );
  }
}
