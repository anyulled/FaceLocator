/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { CopyObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { Client } = require("pg");

const { getDatabaseConfig, getRequiredEnv } = require("./lib");

const PHOTO_PREVIEW_TTL_SECONDS = 60 * 10;
const PHOTO_PREVIEW_RESPONSE_CONTENT_TYPE = "image/jpeg";
const env = getRequiredEnv(process.env);
const s3Client = new S3Client({ region: env.awsRegion });

const CONNECTIVITY_CODES = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "ECONNRESET",
]);

const QUERY_CODES = new Set([
  "23505",
  "23503",
  "42P01",
  "42703",
  "42601",
]);

const ADMIN_EVENTS_SCHEMA_QUERIES = [
  {
    text: `ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS public_base_url text`,
  },
  {
    text: `ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS venue text`,
  },
  {
    text: `ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS description text`,
  },
  {
    text: `ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS ends_at timestamptz`,
  },
  {
    text: `ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS logo_object_key text`,
  },
  {
    text: `UPDATE events SET public_base_url = $1 WHERE public_base_url IS NULL`,
    values: ["https://localhost:3000"],
  },
  {
    text: `ALTER TABLE IF EXISTS events ALTER COLUMN public_base_url SET DEFAULT 'https://localhost:3000'`,
  },
];

let ensureAdminEventsSchemaPromise = null;

function classifyError(error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code || "") : "";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (code && (CONNECTIVITY_CODES.has(code) || code.startsWith("57P") || code === "53300")) {
    return {
      statusCode: 503,
      errorMessage:
        "Database connection failed. Check private RDS reachability, security groups, subnet routes, and whether the instance is healthy.",
    };
  }

  if (
    code === "28P01" ||
    code === "3D000" ||
    message.includes("accessdenied") ||
    message.includes("secretsmanager") ||
    message.includes("secret") ||
    message.includes("password authentication failed") ||
    (message.includes("role") && message.includes("does not exist"))
  ) {
    return {
      statusCode: 500,
      errorMessage:
        "Database configuration is unavailable. Check the database secret name, host, database name, username, and password stored in Secrets Manager.",
    };
  }

  if (code && QUERY_CODES.has(code)) {
    return {
      statusCode: 500,
      errorMessage:
        "Database query failed. Check the SQL statement, schema, and expected table or column names.",
    };
  }

  if (message.includes("timeout") || message.includes("connection") || message.includes("network")) {
    return {
      statusCode: 503,
      errorMessage:
        "Database connection failed. Check private RDS reachability, security groups, subnet routes, and whether the instance is healthy.",
    };
  }

  return {
    statusCode: 500,
    errorMessage:
      "Database query failed. Check the SQL statement, schema, and expected table or column names.",
  };
}

async function withDatabase(callback) {
  const config = await getDatabaseConfig(env);
  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.dbname,
    user: config.username,
    password: config.password,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await ensureAdminEventsSchema(client);
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function runAdminEventsSchemaQueries(client) {
  for (const query of ADMIN_EVENTS_SCHEMA_QUERIES) {
    await client.query(query.text, query.values);
  }
}

async function ensureAdminEventsSchema(client) {
  if (!ensureAdminEventsSchemaPromise) {
    ensureAdminEventsSchemaPromise = runAdminEventsSchemaQueries(client).catch((error) => {
      ensureAdminEventsSchemaPromise = null;
      throw error;
    });
  }

  return ensureAdminEventsSchemaPromise;
}

async function buildPreviewUrl(objectKey) {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: env.eventPhotosBucketName,
        Key: objectKey,
      }),
    );

    return await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: env.eventPhotosBucketName,
        Key: objectKey,
        ResponseContentType: PHOTO_PREVIEW_RESPONSE_CONTENT_TYPE,
      }),
      { expiresIn: PHOTO_PREVIEW_TTL_SECONDS },
    );
  } catch {
    return null;
  }
}

async function listAdminEvents(input) {
  const offset = (input.page - 1) * input.pageSize;
  return withDatabase(async (client) => {
    const [rowsRes, totalRes] = await Promise.all([
      client.query(
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
      client.query(`SELECT COUNT(*)::text AS total FROM events`),
    ]);

    return {
      events: rowsRes.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        venue: row.venue || "",
        description: row.description || "",
        startsAt: row.startsAt || new Date(0).toISOString(),
        endsAt: row.endsAt || row.startsAt || new Date(0).toISOString(),
        logoObjectKey: row.logoObjectKey || undefined,
        photoCount: Number(row.photoCount),
      })),
      totalCount: Number(totalRes.rows[0]?.total || "0"),
    };
  });
}

async function createAdminEvent(input) {
  return withDatabase(async (client) => {
    const normalizedSlug = String(input.slug || "").trim().toLowerCase();
    const result = await client.query(
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
        input.logoObjectKey || null,
        env.publicBaseUrl || "https://localhost:3000",
      ],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      venue: row.venue || "",
      description: row.description || "",
      startsAt: row.startsAt || input.startsAt,
      endsAt: row.endsAt || input.endsAt,
      logoObjectKey: row.logoObjectKey || undefined,
      photoCount: 0,
    };
  });
}

async function deleteAdminEvent(input) {
  return withDatabase(async (client) => {
    const normalizedSlug = String(input.slug || "").trim().toLowerCase();
    const result = await client.query(
      `
        DELETE FROM events
        WHERE slug = $1
        RETURNING id
      `,
      [normalizedSlug],
    );

    return {
      deleted: result.rowCount > 0,
    };
  });
}

async function getAdminEventPhotosPage(input) {
  return withDatabase(async (client) => {
    const eventRes = await client.query(
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

    const event = eventRes.rows[0];
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
      client.query(
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
      client.query(
        `
          SELECT COUNT(*)::text AS total
          FROM event_photos ep
          JOIN events e ON e.id = ep.event_id
          WHERE e.slug = $1
            AND ep.deleted_at IS NULL
        `,
        [input.eventSlug],
      ),
      client.query(
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
      client.query(
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

    const photos = [];
    for (const row of rowsRes.rows) {
      photos.push({
        id: row.id,
        eventId: row.eventId,
        eventSlug: row.eventSlug,
        objectKey: row.objectKey,
        status: row.status,
        uploadedAt: row.uploadedAt,
        previewUrl: await buildPreviewUrl(row.objectKey),
      });
    }

    const matchedFaces = faceMatchesRes.rows.map((row) => ({
      attendeeId: row.attendeeId,
      attendeeName: row.attendeeName || "Attendee",
      attendeeEmail: row.attendeeEmail || "",
      faceEnrollmentId: row.faceEnrollmentId,
      faceId: row.faceId,
      matchedPhotoCount: Number(row.matchedPhotoCount),
      lastMatchedAt: row.lastMatchedAt || new Date().toISOString(),
    }));

    return {
      event: {
        id: event.id,
        slug: event.slug,
        title: event.title,
        venue: event.venue || "",
        description: event.description || "",
        startsAt: event.startsAt || new Date(0).toISOString(),
        endsAt: event.endsAt || event.startsAt || new Date(0).toISOString(),
        logoObjectKey: event.logoObjectKey || undefined,
      },
      photos,
      faceMatchSummary: {
        totalMatchedFaces: matchedFaces.length,
        totalRegisteredSelfies: Number(eventStatsRes.rows[0]?.totalRegisteredSelfies || "0"),
        totalAssociatedUsers: Number(eventStatsRes.rows[0]?.totalAssociatedUsers || "0"),
        matchedFaces,
      },
      page: input.page,
      pageSize: input.pageSize,
      totalCount: Number(totalRes.rows[0]?.total || "0"),
    };
  });
}

function getObjectKeyExtension(objectKey) {
  const match = String(objectKey || "").match(/\.([a-z0-9]+)$/i);
  return (match && match[1] ? String(match[1]).toLowerCase() : "") || "jpg";
}

function sanitizeSegment(value) {
  return String(value || "").trim().replace(/\s+/g, "-").toLowerCase();
}

function buildEventPhotoPendingObjectKey(input) {
  const extension = String(input.extension || "jpg").replace(/^\./, "").toLowerCase();
  return `events/pending/${sanitizeSegment(input.eventId)}/photos/${sanitizeSegment(input.photoId)}.${extension}`;
}

function buildS3CopySource(bucketName, objectKey) {
  return `${bucketName}/${String(objectKey || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

async function reprocessAdminEventPhotos(input) {
  return withDatabase(async (client) => {
    const eventRes = await client.query(
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

    const rowsRes = await client.query(
      `
        SELECT
          ep.id,
          ep.object_key AS "objectKey"
        FROM event_photos ep
        JOIN events e ON e.id = ep.event_id
        WHERE e.slug = $1
          AND ep.deleted_at IS NULL
      `,
      [input.eventSlug],
    );

    const stamp = Date.now().toString();
    let queued = 0;
    let failed = 0;

    for (const row of rowsRes.rows) {
      const extension = getObjectKeyExtension(row.objectKey);
      const basePendingKey = buildEventPhotoPendingObjectKey({
        eventId: event.id,
        photoId: row.id,
        extension,
      });
      const targetKey =
        basePendingKey === row.objectKey
          ? buildEventPhotoPendingObjectKey({
              eventId: event.id,
              photoId: `${row.id}-reprocess-${stamp}`,
              extension,
            })
          : basePendingKey;

      try {
        await s3Client.send(
          new CopyObjectCommand({
            Bucket: env.eventPhotosBucketName,
            CopySource: buildS3CopySource(env.eventPhotosBucketName, row.objectKey),
            Key: targetKey,
            MetadataDirective: "REPLACE",
            Metadata: {
              "event-id": event.id,
              "photo-id": row.id,
            },
          }),
        );
        queued += 1;
      } catch {
        failed += 1;
      }
    }

    return {
      eventSlug: input.eventSlug,
      total: rowsRes.rows.length,
      queued,
      failed,
    };
  });
}

async function handler(event) {
  try {
    const payload = event || {};
    if (payload.operation === "listAdminEvents") {
      return await listAdminEvents(payload.input);
    }

    if (payload.operation === "createAdminEvent") {
      return await createAdminEvent(payload.input);
    }

    if (payload.operation === "deleteAdminEvent") {
      return await deleteAdminEvent(payload.input);
    }

    if (payload.operation === "getAdminEventPhotosPage") {
      return await getAdminEventPhotosPage(payload.input);
    }

    if (payload.operation === "reprocessAdminEventPhotos") {
      return await reprocessAdminEventPhotos(payload.input);
    }

    return {
      statusCode: 400,
      errorMessage: "Unsupported admin read operation",
    };
  } catch (error) {
    const classified = classifyError(error);
    console.error(
      JSON.stringify({
        scope: "admin-read-lambda",
        level: "error",
        message: "Admin read lambda failed",
        operation: event && event.operation ? event.operation : "unknown",
        statusCode: classified.statusCode,
        troubleshooting: classified.errorMessage,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
      }),
    );

    return {
      statusCode: classified.statusCode,
      errorMessage: classified.errorMessage,
    };
  }
}

module.exports = { handler };
