import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getDatabasePool } from "@/lib/aws/database";
import type {
  AdminEventPhoto,
  AdminEventPhotosPage,
  AdminEventSummary,
  CreateEventInput,
  PhotoDeleteResult,
} from "@/lib/admin/events/contracts";

const PHOTO_PREVIEW_TTL_SECONDS = 60 * 10;

let schemaReady: Promise<void> | null = null;

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

async function ensureAdminEventSchema() {
  if (schemaReady) {
    await schemaReady;
    return;
  }

  schemaReady = (async () => {
    const pool = await getDatabasePool();

    await pool.query(`
      ALTER TABLE events
      ADD COLUMN IF NOT EXISTS venue text,
      ADD COLUMN IF NOT EXISTS description text,
      ADD COLUMN IF NOT EXISTS ends_at timestamptz
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_events_slug ON events (slug)
    `);
  })();

  await schemaReady;
}

type EventRow = {
  id: string;
  slug: string;
  title: string;
  venue: string | null;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  photoCount: string;
};

export async function listAdminEvents(input: { page: number; pageSize: number }): Promise<{
  events: AdminEventSummary[];
  totalCount: number;
}> {
  await ensureAdminEventSchema();

  const pool = await getDatabasePool();
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
          COUNT(ep.id)::text AS "photoCount"
        FROM events e
        LEFT JOIN event_photos ep
          ON ep.event_id = e.id
         AND ep.deleted_at IS NULL
        GROUP BY e.id, e.slug, e.title, e.venue, e.description, e.scheduled_at, e.ends_at
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
      photoCount: Number(row.photoCount),
    })),
    totalCount: Number(totalRes.rows[0]?.total ?? "0"),
  };
}

export async function createAdminEvent(input: CreateEventInput): Promise<AdminEventSummary> {
  await ensureAdminEventSchema();

  const pool = await getDatabasePool();
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
        public_base_url
      )
      VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8)
      RETURNING
        id,
        slug,
        title,
        venue,
        description,
        scheduled_at AS "startsAt",
        ends_at AS "endsAt",
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
    photoCount: 0,
  };
}

type EventHeaderRow = {
  id: string;
  slug: string;
  title: string;
  venue: string | null;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

type PhotoRow = {
  id: string;
  eventId: string;
  eventSlug: string;
  objectKey: string;
  status: string;
  uploadedAt: string;
};

export async function getAdminEventHeader(eventSlug: string) {
  await ensureAdminEventSchema();

  const pool = await getDatabasePool();
  const result = await pool.query<EventHeaderRow>(
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
  };
}

async function buildPreviewUrl(s3Client: S3Client, objectKey: string) {
  const bucketName = getEventPhotosBucketName();

  try {
    return await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
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
  await ensureAdminEventSchema();

  const pool = await getDatabasePool();
  const event = await getAdminEventHeader(input.eventSlug);
  if (!event) {
    return {
      photos: [],
      page: input.page,
      pageSize: input.pageSize,
      totalCount: 0,
    };
  }

  const offset = (input.page - 1) * input.pageSize;

  const [rowsRes, totalRes] = await Promise.all([
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

  return {
    photos,
    page: input.page,
    pageSize: input.pageSize,
    totalCount: Number(totalRes.rows[0]?.total ?? "0"),
  };
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

export async function deleteAdminEventPhoto(input: {
  eventSlug: string;
  photoId: string;
}): Promise<PhotoDeleteResult> {
  await ensureAdminEventSchema();

  const pool = await getDatabasePool();
  const client = await pool.connect();

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
      await client.query("ROLLBACK");
      return { photoId: input.photoId, status: "not_found" };
    }

    await deleteObjectFromS3(row.objectKey);

    await client.query(`DELETE FROM photo_face_matches WHERE event_photo_id = $1`, [input.photoId]);
    await client.query(`DELETE FROM event_photos WHERE id = $1`, [input.photoId]);

    await client.query("COMMIT");

    return {
      photoId: input.photoId,
      status: "deleted",
    };
  } catch (error) {
    await client.query("ROLLBACK");

    return {
      photoId: input.photoId,
      status: "failed",
      message: error instanceof Error ? error.message : "Delete failed",
    };
  } finally {
    client.release();
  }
}

export async function deleteAdminEventPhotosBatch(input: {
  eventSlug: string;
  photoIds: string[];
}) {
  const results: PhotoDeleteResult[] = [];

  for (const photoId of input.photoIds) {
    const result = await deleteAdminEventPhoto({
      eventSlug: input.eventSlug,
      photoId,
    });
    results.push(result);
  }

  return results;
}
