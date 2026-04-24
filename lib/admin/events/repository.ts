import { createHash, randomUUID } from "node:crypto";

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getDatabasePool } from "@/lib/aws/database";
import { runDatabaseOperation } from "@/lib/aws/database-errors";
import type {
  AdminEventFaceMatch,
  AdminEventPhoto,
  AdminEventPhotosPage,
  AdminEventSummary,
  AdminPhotoPresignResponse,
  BatchDeleteSummary,
  CreateEventInput,
  PhotoDeleteResult,
} from "@/lib/admin/events/contracts";
import { ensureAdminEventsSchema } from "@/lib/admin/events/schema";
import { buildEventPhotoPendingObjectKey } from "@/lib/aws/boundary";

const PHOTO_PREVIEW_TTL_SECONDS = 60 * 10;
const PHOTO_PREVIEW_RESPONSE_CONTENT_TYPE = "image/jpeg";
const PHOTO_UPLOAD_TTL_SECONDS = 60 * 10;

type DeleteAuditResult = PhotoDeleteResult["status"];

type BatchReplayRow = {
  requestHash: string;
  responsePayload: BatchDeleteSummary;
  statusCode: number;
};

function adminDatabaseContext(input: Record<string, unknown>) {
  return input;
}

function getEventPhotosBucketName() {
  const bucket = process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET;
  if (!bucket) {
    throw new Error("FACE_LOCATOR_EVENT_PHOTOS_BUCKET is required");
  }

  return bucket;
}

function getS3Client() {
  return new S3Client({ region: process.env.AWS_REGION || "eu-west-1" });
}

type EventRow = {
  id: string;
  slug: string;
  title: string;
  venue: string | null;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  logoObjectKey: string | null;
  photoCount: string;
};

export async function listAdminEvents(input: { page: number; pageSize: number }): Promise<{
  events: AdminEventSummary[];
  totalCount: number;
}> {
  return runDatabaseOperation({
    operation: "admin.listAdminEvents",
    label: "listing admin events",
    context: adminDatabaseContext({
      page: input.page,
      pageSize: input.pageSize,
    }),
    handler: async () => {
      const pool = await getDatabasePool();
      await ensureAdminEventsSchema(pool);
      const offset = (input.page - 1) * input.pageSize;

      const [rowsRes, totalRes] = await Promise.all([
        pool.query<EventRow>(
          `
            SELECT
              e.id,
              e.slug,
              e.title,
            e.venue,
            e.description,
            e.scheduled_at AS "startsAt",
            e.ends_at AS "endsAt",
            e.logo_object_key AS "logoObjectKey",
            COUNT(ep.id)::text AS "photoCount"
            FROM events e
            LEFT JOIN event_photos ep
              ON ep.event_id = e.id
             AND ep.deleted_at IS NULL
            GROUP BY e.id, e.slug, e.title, e.venue, e.description, e.scheduled_at, e.ends_at, e.logo_object_key
            ORDER BY e.scheduled_at DESC NULLS LAST, e.created_at DESC
            LIMIT $1 OFFSET $2
          `,
          [input.pageSize, offset],
        ),
        pool.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM events`),
      ]);

      return {
        events: rowsRes.rows.map((row) => ({
          id: row.id,
          slug: row.slug,
          title: row.title,
          venue: row.venue ?? "",
          description: row.description ?? "",
          startsAt: row.startsAt ?? new Date(0).toISOString(),
          endsAt: row.endsAt ?? row.startsAt ?? new Date(0).toISOString(),
          logoObjectKey: row.logoObjectKey ?? undefined,
          photoCount: Number(row.photoCount),
        })),
        totalCount: Number(totalRes.rows[0]?.total ?? "0"),
      };
    },
  });
}

export async function createAdminEvent(input: CreateEventInput): Promise<AdminEventSummary> {
  return runDatabaseOperation({
    operation: "admin.createAdminEvent",
    label: "creating an admin event",
    context: adminDatabaseContext({ slug: input.slug }),
    handler: async () => {
      const pool = await getDatabasePool();
      await ensureAdminEventsSchema(pool);
      const normalizedSlug = input.slug.trim().toLowerCase();

      const result = await pool.query<EventRow>(
        `
          INSERT INTO events (
            id,
            slug,
            title,
            venue,
            description,
            scheduled_at,
            ends_at,
            logo_object_key,
            public_base_url
          )
          VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, $9)
          RETURNING
            id,
            slug,
            title,
            venue,
            description,
            scheduled_at AS "startsAt",
            ends_at AS "endsAt",
            logo_object_key AS "logoObjectKey",
            '0' AS "photoCount"
      `,
        [
          normalizedSlug,
          normalizedSlug,
          input.title,
          input.venue,
          input.description,
          input.startsAt,
          input.endsAt,
          input.logoObjectKey ?? null,
          process.env.FACE_LOCATOR_PUBLIC_BASE_URL ?? "https://localhost:3000",
        ],
      );

      const row = result.rows[0];
      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        venue: row.venue ?? "",
        description: row.description ?? "",
        startsAt: row.startsAt ?? input.startsAt,
        endsAt: row.endsAt ?? input.endsAt,
        logoObjectKey: row.logoObjectKey ?? undefined,
        photoCount: 0,
      };
    },
  });
}

type EventHeaderRow = {
  id: string;
  slug: string;
  title: string;
  venue: string | null;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  logoObjectKey: string | null;
};

type PhotoRow = {
  id: string;
  eventId: string;
  eventSlug: string;
  objectKey: string;
  status: string;
  uploadedAt: string;
};

type FaceMatchRow = {
  attendeeId: string;
  attendeeName: string | null;
  attendeeEmail: string | null;
  faceEnrollmentId: string;
  faceId: string;
  matchedPhotoCount: number;
  lastMatchedAt: string | null;
};

export async function getAdminEventHeader(eventSlug: string) {
  return runDatabaseOperation({
    operation: "admin.getAdminEventHeader",
    label: "loading an admin event header",
    context: adminDatabaseContext({ eventSlug }),
    handler: async () => {
      const pool = await getDatabasePool();
      await ensureAdminEventsSchema(pool);
      const result = await pool.query<EventHeaderRow>(
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
        [eventSlug],
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        venue: row.venue ?? "",
        description: row.description ?? "",
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        logoObjectKey: row.logoObjectKey ?? undefined,
      };
    },
  });
}

export async function createAdminEventPhotoUpload(input: {
  eventSlug: string;
  contentType: string;
  uploadedBy: string;
}): Promise<AdminPhotoPresignResponse | null> {
  return runDatabaseOperation({
    operation: "admin.createAdminEventPhotoUpload",
    label: "creating an admin photo upload contract",
    context: adminDatabaseContext({
      eventSlug: input.eventSlug,
      contentType: input.contentType,
      uploadedBy: input.uploadedBy,
    }),
    handler: async () => {
      const event = await getAdminEventHeader(input.eventSlug);
      if (!event) {
        return null;
      }

      const photoId = randomUUID();
      const objectKey = buildEventPhotoPendingObjectKey({
        eventId: event.id,
        photoId,
        extension: "jpg",
      });
      const command = new PutObjectCommand({
        Bucket: getEventPhotosBucketName(),
        Key: objectKey,
        ContentType: input.contentType,
        Metadata: {
          "event-id": event.id,
          "photo-id": photoId,
          "uploaded-by": input.uploadedBy,
        },
      });

      const url = await getSignedUrl(getS3Client(), command, {
        expiresIn: PHOTO_UPLOAD_TTL_SECONDS,
        signableHeaders: new Set([
          "content-type",
          "x-amz-meta-event-id",
          "x-amz-meta-photo-id",
          "x-amz-meta-uploaded-by",
        ]),
      });

      return {
        event: {
          id: event.id,
          slug: event.slug,
        },
        photo: {
          photoId,
          objectKey,
          uploadedBy: input.uploadedBy,
        },
        upload: {
          method: "PUT",
          url,
          headers: {
            "Content-Type": input.contentType,
            "x-amz-meta-event-id": event.id,
            "x-amz-meta-photo-id": photoId,
            "x-amz-meta-uploaded-by": input.uploadedBy,
          },
          objectKey,
          expiresAt: new Date(Date.now() + PHOTO_UPLOAD_TTL_SECONDS * 1000).toISOString(),
        },
      };
    },
  });
}

async function buildPreviewUrl(s3Client: S3Client, objectKey: string) {
  const bucketName = getEventPhotosBucketName();

  try {
    return await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        ResponseContentType: PHOTO_PREVIEW_RESPONSE_CONTENT_TYPE,
      }),
      { expiresIn: PHOTO_PREVIEW_TTL_SECONDS },
    );
  } catch {
    return null;
  }
}

export async function listAdminEventPhotos(input: {
  eventSlug: string;
  page: number;
  pageSize: number;
}): Promise<AdminEventPhotosPage> {
  return runDatabaseOperation({
    operation: "admin.listAdminEventPhotos",
    label: "listing admin event photos",
    context: adminDatabaseContext({
      eventSlug: input.eventSlug,
      page: input.page,
      pageSize: input.pageSize,
    }),
    handler: async () => {
      const pool = await getDatabasePool();
      const event = await getAdminEventHeader(input.eventSlug);
      if (!event) {
        return {
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
        pool.query<PhotoRow>(
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
        pool.query<FaceMatchRow>(
          `
            SELECT
              ea.attendee_id AS "attendeeId",
              a.name AS "attendeeName",
              a.email AS "attendeeEmail",
              current_face.id AS "faceEnrollmentId",
              current_face.rekognition_face_id AS "faceId",
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
            ) current_face ON true
            JOIN photo_face_matches m
              ON m.attendee_id = ea.attendee_id
             AND m.face_enrollment_id = current_face.id
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
              current_face.id,
              current_face.rekognition_face_id
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
                  AND ea.withdrawal_at IS NULL
              ) AS "totalAssociatedUsers"
          `,
          [event.id],
        ),
      ]);

      const s3Client = getS3Client();
      const photos: AdminEventPhoto[] = await Promise.all(
        rowsRes.rows.map(async (row) => ({
          id: row.id,
          eventId: row.eventId,
          eventSlug: row.eventSlug,
          objectKey: row.objectKey,
          status: row.status,
          uploadedAt: row.uploadedAt,
          previewUrl: await buildPreviewUrl(s3Client, row.objectKey),
        })),
      );

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
        photos,
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
    },
  });
}

async function deleteObjectFromS3(objectKey: string) {
  const bucketName = getEventPhotosBucketName();
  const s3Client = getS3Client();

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    }),
  );
}

async function insertDeleteAudit(input: {
  actorSub: string;
  eventSlug: string;
  photoId: string;
  result: DeleteAuditResult;
  requestId: string;
  errorMessage?: string;
  eventPhotoId?: string;
}) {
  const pool = await getDatabasePool();
  await pool.query(
    `
      INSERT INTO admin_photo_delete_audit (
        id,
        request_id,
        actor_sub,
        event_slug,
        photo_id,
        event_photo_id,
        result,
        error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      randomUUID(),
      input.requestId,
      input.actorSub,
      input.eventSlug,
      input.photoId,
      input.eventPhotoId ?? null,
      input.result,
      input.errorMessage ?? null,
    ],
  );
}

export async function deleteAdminEventPhoto(input: {
  eventSlug: string;
  photoId: string;
  actorSub: string;
  requestId?: string;
}): Promise<PhotoDeleteResult> {
  return runDatabaseOperation({
    operation: "admin.deleteAdminEventPhoto",
    label: "deleting an admin event photo",
    context: adminDatabaseContext({
      eventSlug: input.eventSlug,
      photoId: input.photoId,
      actorSub: input.actorSub,
      requestId: input.requestId ?? null,
    }),
    handler: async () => {
      const pool = await getDatabasePool();
      const client = await pool.connect();
      const requestId = input.requestId ?? randomUUID();

      try {
        await client.query("BEGIN");

        const rowRes = await client.query<{ objectKey: string }>(
          `
            SELECT ep.object_key AS "objectKey"
            FROM event_photos ep
            JOIN events e ON e.id = ep.event_id
            WHERE e.slug = $1
              AND ep.id = $2
              AND ep.deleted_at IS NULL
            FOR UPDATE
          `,
          [input.eventSlug, input.photoId],
        );

        const row = rowRes.rows[0];
        if (!row) {
          await client.query("COMMIT");
          await insertDeleteAudit({
            actorSub: input.actorSub,
            eventSlug: input.eventSlug,
            photoId: input.photoId,
            result: "not_found",
            requestId,
          });
          return { photoId: input.photoId, status: "not_found" };
        }

        try {
          await deleteObjectFromS3(row.objectKey);
        } catch (error) {
          await client.query("COMMIT");
          const message = error instanceof Error ? error.message : "S3 delete failed";
          await insertDeleteAudit({
            actorSub: input.actorSub,
            eventSlug: input.eventSlug,
            photoId: input.photoId,
            result: "failed",
            requestId,
            errorMessage: message,
          });
          return {
            photoId: input.photoId,
            status: "failed",
            message,
          };
        }

        await client.query(`DELETE FROM photo_face_matches WHERE event_photo_id = $1`, [input.photoId]);
        await client.query(`DELETE FROM event_photos WHERE id = $1`, [input.photoId]);
        await client.query("COMMIT");

        await insertDeleteAudit({
          actorSub: input.actorSub,
          eventSlug: input.eventSlug,
          photoId: input.photoId,
          result: "deleted",
          requestId,
          eventPhotoId: input.photoId,
        });

        return {
          photoId: input.photoId,
          status: "deleted",
        };
      } catch (error) {
        await client.query("ROLLBACK");

        const message = error instanceof Error ? error.message : "Delete failed";
        await insertDeleteAudit({
          actorSub: input.actorSub,
          eventSlug: input.eventSlug,
          photoId: input.photoId,
          result: "failed",
          requestId,
          errorMessage: message,
        });

        return {
          photoId: input.photoId,
          status: "failed",
          message,
        };
      } finally {
        client.release();
      }
    },
  });
}

function hashBatchDeleteRequest(eventSlug: string, photoIds: string[]) {
  const canonicalPayload = JSON.stringify({
    eventSlug,
    photoIds: [...photoIds].sort(),
  });

  return createHash("sha256").update(canonicalPayload).digest("hex");
}

async function getIdempotencyReplay(eventSlug: string, idempotencyKey: string) {
  return runDatabaseOperation({
    operation: "admin.getIdempotencyReplay",
    label: "loading a batch delete replay",
    context: adminDatabaseContext({
      eventSlug,
      idempotencyKey,
    }),
    handler: async () => {
      const pool = await getDatabasePool();
      const result = await pool.query<BatchReplayRow>(
        `
          SELECT
            request_hash AS "requestHash",
            response_payload AS "responsePayload",
            status_code AS "statusCode"
          FROM admin_batch_delete_idempotency
          WHERE event_slug = $1
            AND idempotency_key = $2
          LIMIT 1
        `,
        [eventSlug, idempotencyKey],
      );

      return result.rows[0] ?? null;
    },
  });
}

async function storeIdempotencyReplay(input: {
  eventSlug: string;
  idempotencyKey: string;
  requestHash: string;
  actorSub: string;
  responsePayload: BatchDeleteSummary;
  statusCode: number;
}) {
  const pool = await getDatabasePool();
  await pool.query(
    `
      INSERT INTO admin_batch_delete_idempotency (
        id,
        event_slug,
        idempotency_key,
        request_hash,
        actor_sub,
        response_payload,
        status_code
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    `,
    [
      randomUUID(),
      input.eventSlug,
      input.idempotencyKey,
      input.requestHash,
      input.actorSub,
      JSON.stringify(input.responsePayload),
      input.statusCode,
    ],
  );
}

export async function deleteAdminEventPhotosBatch(input: {
  eventSlug: string;
  photoIds: string[];
  actorSub: string;
  idempotencyKey: string;
}): Promise<BatchDeleteSummary> {
  return runDatabaseOperation({
    operation: "admin.deleteAdminEventPhotosBatch",
    label: "processing a batch photo delete",
    context: adminDatabaseContext({
      eventSlug: input.eventSlug,
      photoCount: input.photoIds.length,
      actorSub: input.actorSub,
      idempotencyKey: input.idempotencyKey,
    }),
    handler: async () => {
      const requestHash = hashBatchDeleteRequest(input.eventSlug, input.photoIds);
      const existingReplay = await getIdempotencyReplay(input.eventSlug, input.idempotencyKey);

      if (existingReplay) {
        if (existingReplay.requestHash !== requestHash) {
          throw new Error("IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD");
        }

        return existingReplay.responsePayload;
      }

      const requestId = `${input.idempotencyKey}:${randomUUID()}`;
      const results: PhotoDeleteResult[] = [];

      for (const photoId of input.photoIds) {
        const result = await deleteAdminEventPhoto({
          eventSlug: input.eventSlug,
          photoId,
          actorSub: input.actorSub,
          requestId,
        });
        results.push(result);
      }

      const summary: BatchDeleteSummary = {
        results,
        deleted: results.filter((item) => item.status === "deleted").length,
        notFound: results.filter((item) => item.status === "not_found").length,
        failed: results.filter((item) => item.status === "failed").length,
      };

      try {
        await storeIdempotencyReplay({
          eventSlug: input.eventSlug,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          actorSub: input.actorSub,
          responsePayload: summary,
          statusCode: 200,
        });
      } catch (error) {
        const isDuplicateKeyError =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: string }).code === "23505";

        if (!isDuplicateKeyError) {
          throw error;
        }

        const replay = await getIdempotencyReplay(input.eventSlug, input.idempotencyKey);
        if (!replay || replay.requestHash !== requestHash) {
          throw new Error("IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD");
        }

        return replay.responsePayload;
      }

      return summary;
    },
  });
}
