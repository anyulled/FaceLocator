/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { GetObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { Client } = require("pg");

const { getDatabaseConfig, getRequiredEnv } = require("./lib");

const env = getRequiredEnv(process.env);
const s3Client = new S3Client({ region: env.awsRegion });
const PHOTO_PREVIEW_TTL_SECONDS = 60 * 10;

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
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function buildPreviewUrl(objectKey) {
  try {
    return await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: env.eventPhotosBucketName,
        Key: objectKey,
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
        photoCount: Number(row.photoCount),
      })),
      totalCount: Number(totalRes.rows[0]?.total || "0"),
    };
  });
}

async function getAdminEventHeader(eventSlug) {
  return withDatabase(async (client) => {
    const result = await client.query(
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
      venue: row.venue || "",
      description: row.description || "",
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    };
  });
}

async function listAdminEventPhotos(input) {
  const event = await getAdminEventHeader(input.eventSlug);
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
  return withDatabase(async (client) => {
    const [rowsRes, totalRes] = await Promise.all([
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

    return {
      event,
      photos,
      page: input.page,
      pageSize: input.pageSize,
      totalCount: Number(totalRes.rows[0]?.total || "0"),
    };
  });
}

async function handler(event) {
  try {
    const payload = event || {};
    if (payload.operation === "listAdminEvents") {
      return await listAdminEvents(payload.input);
    }

    if (payload.operation === "getAdminEventPhotosPage") {
      return await listAdminEventPhotos(payload.input);
    }

    return {
      statusCode: 400,
      errorMessage: "Unsupported admin read operation",
    };
  } catch (error) {
    return {
      statusCode: 500,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

module.exports = { handler };
