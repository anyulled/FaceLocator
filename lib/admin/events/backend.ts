import "server-only";

import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { listAdminEvents } from "@/lib/admin/events/repository";
import { getDatabasePool } from "@/lib/aws/database";
import type {
  AdminEventPhotosPage,
  AdminEventSummary,
  CreateEventInput,
} from "@/lib/admin/events/contracts";

type AdminReadBackendMode = "direct" | "lambda";

type AdminReadBackendErrorDetails = {
  operation: string;
  backend: AdminReadBackendMode;
  lambdaName: string;
  response?: unknown;
};

const DEFAULT_ADMIN_READ_LAMBDA_NAME = "face-locator-poc-admin-events-read";
const PHOTO_PREVIEW_TTL_SECONDS = 60 * 10;

let lambdaClient: LambdaClient | null = null;
let s3Client: S3Client | null = null;

export class AdminReadBackendError extends Error {
  public readonly statusCode: number;

  public readonly details: AdminReadBackendErrorDetails;

  constructor(message: string, statusCode: number, details: AdminReadBackendErrorDetails) {
    super(message);
    this.name = "AdminReadBackendError";
    this.statusCode = statusCode;
    this.details = details;
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

export function getAdminReadBackendMode(): AdminReadBackendMode {
  const mode = readEnv("ADMIN_READ_BACKEND", "FACE_LOCATOR_ADMIN_READ_BACKEND");
  return mode === "lambda" ? "lambda" : "direct";
}

export function getAdminEventsReadLambdaName() {
  return (
    readEnv(
      "FACE_LOCATOR_ADMIN_EVENTS_READ_LAMBDA_NAME",
      "ADMIN_EVENTS_READ_LAMBDA_NAME",
      "ADMIN_READ_LAMBDA_NAME",
    ) || DEFAULT_ADMIN_READ_LAMBDA_NAME
  );
}

function getLambdaClient() {
  if (!lambdaClient) {
    lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || "eu-west-1" });
  }

  return lambdaClient;
}

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-1" });
  }

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
      }),
      { expiresIn: PHOTO_PREVIEW_TTL_SECONDS },
    );
  } catch {
    return null;
  }
}

async function invokeAdminReadLambda<T>(operation: string, input: unknown): Promise<T> {
  const lambdaName = getAdminEventsReadLambdaName();

  try {
    const response = await getLambdaClient().send(
      new InvokeCommand({
        FunctionName: lambdaName,
        InvocationType: "RequestResponse",
        Payload: Buffer.from(
          JSON.stringify({
            operation,
            input,
          }),
        ),
      }),
    );

    const payloadText = response.Payload ? Buffer.from(response.Payload).toString("utf8") : "";
    const payload = payloadText ? JSON.parse(payloadText) : null;

    if (!payload) {
      throw new AdminReadBackendError(
        "Admin read backend returned an empty response. Check the Lambda logs and invocation contract.",
        502,
        {
          operation,
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
          : "Admin read backend failed.";

      throw new AdminReadBackendError(errorMessage, statusCode, {
        operation,
        backend: "lambda",
        lambdaName,
        response: payload,
      });
    }

    return payload as T;
  } catch (error) {
    if (error instanceof AdminReadBackendError) {
      throw error;
    }

    throw new AdminReadBackendError(
      "Admin read backend invocation failed. Check the Lambda name, IAM invoke permission, VPC configuration, and CloudWatch logs.",
      503,
      {
        operation,
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

export async function listAdminEventsViaBackend(input: {
  page: number;
  pageSize: number;
}): Promise<{
  events: AdminEventSummary[];
  totalCount: number;
}> {
  if (getAdminReadBackendMode() === "lambda") {
    return invokeAdminReadLambda("listAdminEvents", input);
  }

  return listAdminEvents(input);
}

export async function createAdminEventViaBackend(input: CreateEventInput): Promise<AdminEventSummary> {
  if (getAdminReadBackendMode() === "lambda") {
    return invokeAdminReadLambda("createAdminEvent", input);
  }

  const { createAdminEvent } = await import("@/lib/admin/events/repository");
  return createAdminEvent(input);
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
  } | null;
}> {
  if (getAdminReadBackendMode() === "lambda") {
    return invokeAdminReadLambda("getAdminEventPhotosPage", input);
  }

  const pool = await getDatabasePool();
  const eventResult = await pool.query<{
    id: string;
    slug: string;
    title: string;
    venue: string | null;
    description: string | null;
    startsAt: string | null;
    endsAt: string | null;
  }>(
    `
      SELECT
        e.id,
        e.slug,
        e.title,
        e.venue,
        e.description,
        e.scheduled_at AS "startsAt",
        e.ends_at AS "endsAt"
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
      page: input.page,
      pageSize: input.pageSize,
      totalCount: 0,
    };
  }

  const offset = (input.page - 1) * input.pageSize;
  const [rowsRes, totalRes] = await Promise.all([
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
  ]);

  return {
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      venue: event.venue ?? "",
      description: event.description ?? "",
      startsAt: event.startsAt ?? new Date(0).toISOString(),
      endsAt: event.endsAt ?? event.startsAt ?? new Date(0).toISOString(),
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
    page: input.page,
    pageSize: input.pageSize,
    totalCount: Number(totalRes.rows[0]?.total ?? "0"),
  };
}
