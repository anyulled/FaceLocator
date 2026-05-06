/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const {
  DeleteFacesCommand,
  SearchFacesByImageCommand,
  RekognitionClient,
} = require("@aws-sdk/client-rekognition");
const { GetSecretValueCommand, SecretsManagerClient } = require("@aws-sdk/client-secrets-manager");
const { CopyObjectCommand, HeadObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { Client } = require("pg");

const { getRequiredEnv, parseEventPhotoRecord } = require("./lib");

const env = getRequiredEnv(process.env);
const s3Client = new S3Client({ region: env.awsRegion });
const rekognitionClient = new RekognitionClient({ region: env.awsRegion });
const secretsClient = new SecretsManagerClient({ region: env.awsRegion });

let cachedDatabaseConfig = null;
const EXPIRED_FACE_BATCH_SIZE = 100;

function getDatabaseSslConfig() {
  return process.env.FACE_LOCATOR_DATABASE_SSL_REJECT_UNAUTHORIZED === "0"
    ? { rejectUnauthorized: false }
    : true;
}

async function getDatabaseConfig() {
  if (cachedDatabaseConfig) {
    return cachedDatabaseConfig;
  }

  const response = await secretsClient.send(
    new GetSecretValueCommand({
      SecretId: env.databaseSecretArn || env.databaseSecretName,
    }),
  );

  cachedDatabaseConfig = JSON.parse(response.SecretString);
  return cachedDatabaseConfig;
}

async function withDatabase(callback) {
  const config = await getDatabaseConfig();
  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.dbname,
    user: config.username,
    password: config.password,
    ssl: getDatabaseSslConfig(),
  });

  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function recordUploadedPhoto(input) {
  return withDatabase(async (client) => {
    await client.query(
      `
        INSERT INTO event_photos (
          id,
          event_id,
          object_key,
          status,
          uploaded_at,
          matched_at
        ) VALUES (
          $1,
          $2,
          $3,
          'ready_for_matching',
          now(),
          null
        )
        ON CONFLICT (id) DO UPDATE
        SET object_key = excluded.object_key,
            status = excluded.status,
            matched_at = null
      `,
      [input.photoId, input.eventId, input.objectKey],
    );
  });
}

async function clearPhotoMatches(client, photoId) {
  await client.query(`DELETE FROM photo_face_matches WHERE event_photo_id = $1`, [photoId]);
}

async function persistPhotoMatches(client, input) {
  await clearPhotoMatches(client, input.photoId);

  for (const match of input.matches) {
    await client.query(
      `
        INSERT INTO photo_face_matches (
          id,
          event_photo_id,
          attendee_id,
          face_enrollment_id,
          similarity,
          created_at
        )
        SELECT 
          gen_random_uuid()::text,
          $1,
          $2,
          id,
          $4,
          now()
        FROM face_enrollments
        WHERE rekognition_face_id = $3
      `,
      [input.photoId, match.attendeeId, match.faceEnrollmentId, match.similarity],
    );
  }
}

async function updatePhotoStatus(client, input) {
  await client.query(
    `
      UPDATE event_photos
      SET object_key = $2,
          status = $3,
          matched_at = $4
      WHERE id = $1
    `,
    [
      input.photoId,
      input.objectKey,
      input.status,
      input.status === "matches_found" ? new Date().toISOString() : null,
    ],
  );
}

async function searchFaces(input) {
  const response = await rekognitionClient.send(
    new SearchFacesByImageCommand({
      CollectionId: env.rekognitionCollectionId,
      FaceMatchThreshold: 90,
      MaxFaces: 10,
      Image: {
        S3Object: {
          Bucket: input.bucket,
          Name: input.objectKey,
        },
      },
    }),
  );

  return (response.FaceMatches || []).map((match) => {
    const [eventId, attendeeId] = (match.Face?.ExternalImageId || ":").split(":");

    return {
      eventId,
      attendeeId,
      faceEnrollmentId: match.Face?.FaceId || "unknown-face",
      similarity: match.Similarity || 0,
    };
  });
}

async function listExpiredFaceEnrollments(client, limit = EXPIRED_FACE_BATCH_SIZE) {
  const result = await client.query(
    `
      SELECT
        fe.id,
        fe.event_id AS "eventId",
        fe.attendee_id AS "attendeeId",
        fe.rekognition_face_id AS "faceId"
      FROM face_enrollments fe
      WHERE fe.deleted_at IS NULL
        AND fe.rekognition_face_id IS NOT NULL
        AND COALESCE(fe.enrolled_at, fe.created_at) < now() - ($1::int * interval '1 day')
      ORDER BY COALESCE(fe.enrolled_at, fe.created_at) ASC
      LIMIT $2
    `,
    [env.faceRetentionDays, limit],
  );

  return result.rows;
}

async function expireFaceEnrollment(client, enrollment) {
  await rekognitionClient.send(
    new DeleteFacesCommand({
      CollectionId: env.rekognitionCollectionId,
      FaceIds: [enrollment.faceId],
    }),
  );

  await client.query(
    `
      UPDATE face_enrollments
      SET status = 'expired',
          deleted_at = COALESCE(deleted_at, now())
      WHERE id = $1
        AND deleted_at IS NULL
    `,
    [enrollment.id],
  );
}

async function expireExpiredFaces(client) {
  const enrollments = await listExpiredFaceEnrollments(client);
  let expired = 0;
  let failed = 0;

  for (const enrollment of enrollments) {
    try {
      await expireFaceEnrollment(client, enrollment);
      expired += 1;
    } catch (error) {
      failed += 1;
      console.error(
        JSON.stringify({
          scope: "event-photo-worker",
          level: "error",
          operation: "expireExpiredFaces",
          eventId: enrollment.eventId,
          attendeeId: enrollment.attendeeId,
          faceId: enrollment.faceId,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message, stack: error.stack }
              : { message: String(error) },
        }),
      );
    }
  }

  if (expired > 0 || failed > 0) {
    console.info(
      JSON.stringify({
        scope: "event-photo-worker",
        operation: "expireExpiredFaces",
        retentionDays: env.faceRetentionDays,
        expired,
        failed,
      }),
    );
  }

  return {
    scanned: enrollments.length,
    expired,
    failed,
  };
}

function getObjectKeyExtension(objectKey) {
  const match = String(objectKey || "").match(/\.([a-z0-9]+)$/i);
  return (match && match[1] ? String(match[1]).toLowerCase() : "") || "jpg";
}

function buildMatchedPhotoObjectKey(input) {
  return `events/matched/${input.eventId}/photos/${input.photoId}.${input.extension}`;
}

function buildS3CopySource(bucketName, objectKey) {
  return `${bucketName}/${String(objectKey || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

async function processSinglePhoto(client, input) {
  const matches = await searchFaces({
    bucket: env.eventPhotosBucketName,
    objectKey: input.objectKey,
  });

  let finalObjectKey = input.objectKey;
  const status = matches.length > 0 ? "matches_found" : "ready_for_matching";

  if (matches.length > 0) {
    const targetKey = buildMatchedPhotoObjectKey({
      eventId: input.eventId,
      photoId: input.photoId,
      extension: getObjectKeyExtension(input.objectKey),
    });

    if (targetKey !== input.objectKey) {
      await s3Client.send(
        new CopyObjectCommand({
          Bucket: env.eventPhotosBucketName,
          Key: targetKey,
          CopySource: buildS3CopySource(env.eventPhotosBucketName, input.objectKey),
          MetadataDirective: "COPY",
        }),
      );
    }

    finalObjectKey = targetKey;
  }

  await client.query("BEGIN");
  try {
    await updatePhotoStatus(client, {
      photoId: input.photoId,
      objectKey: finalObjectKey,
      status,
    });
    await persistPhotoMatches(client, {
      photoId: input.photoId,
      matches,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  console.info(
    JSON.stringify({
      scope: "event-photo-worker",
      eventId: input.eventId,
      photoId: input.photoId,
      objectKey: input.objectKey,
      finalObjectKey,
      outcome: status,
      matchCount: matches.length,
      mode: input.forceReprocess ? "manual" : "scheduled",
    }),
  );

  return {
    photoId: input.photoId,
    matched: matches.length > 0,
  };
}

async function listPhotosForMatching(client, input) {
  const conditions = ["ep.deleted_at IS NULL"];
  const values = [];
  let nextParam = 1;

  if (!input.forceReprocess) {
    conditions.push(`ep.status = $${nextParam++}`);
    values.push("ready_for_matching");
  }

  if (input.eventSlug) {
    conditions.push(`e.slug = $${nextParam++}`);
    values.push(input.eventSlug);
  }

  if (input.eventId) {
    conditions.push(`ep.event_id = $${nextParam++}`);
    values.push(input.eventId);
  }

  if (input.photoId) {
    conditions.push(`ep.id = $${nextParam++}`);
    values.push(input.photoId);
  }

  const limit = Number.isFinite(Number(input.limit)) ? Number(input.limit) : 100;
  values.push(limit);

  const result = await client.query(
    `
      SELECT
        ep.id AS "photoId",
        ep.event_id AS "eventId",
        ep.object_key AS "objectKey",
        ep.status,
        e.slug AS "eventSlug"
      FROM event_photos ep
      JOIN events e ON e.id = ep.event_id
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY ep.uploaded_at ASC, ep.created_at ASC
      LIMIT $${nextParam}
    `,
    values,
  );

  return result.rows;
}

async function processPhotos(input) {
  return withDatabase(async (client) => {
    const rows = await listPhotosForMatching(client, {
      eventSlug: input.eventSlug,
      eventId: input.eventId,
      photoId: input.photoId,
      forceReprocess: input.forceReprocess === true,
      limit: input.limit,
    });

    let queued = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        await processSinglePhoto(client, {
          eventId: row.eventId,
          photoId: row.photoId,
          objectKey: row.objectKey,
          forceReprocess: input.forceReprocess === true,
        });
        queued += 1;
      } catch (error) {
        failed += 1;
        console.error(
          JSON.stringify({
            scope: "event-photo-worker",
            level: "error",
            operation: "processSinglePhoto",
            eventId: row.eventId,
            photoId: row.photoId,
            objectKey: row.objectKey,
            error:
              error instanceof Error
                ? { name: error.name, message: error.message, stack: error.stack }
                : { message: String(error) },
          }),
        );
      }
    }

    const expiredFaces = await expireExpiredFaces(client);

    return {
      eventSlug: input.eventSlug || null,
      total: rows.length,
      queued,
      failed,
      expiredFaces,
    };
  });
}

async function handleUploadedRecord(record) {
  const parsed = parseEventPhotoRecord(record);
  if (!parsed) {
    console.warn(JSON.stringify({ outcome: "skipped", reason: "unsupported_event_photo_key", record }));
    return;
  }

  const head = await s3Client.send(
    new HeadObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.key,
    }),
  );

  const photoId = head.Metadata?.["photo-id"] || parsed.fileName.replace(/\.[^.]+$/, "");

  await recordUploadedPhoto({
    eventId: parsed.eventId,
    photoId,
    objectKey: parsed.key,
  });

  console.info(
    JSON.stringify({
      scope: "event-photo-worker",
      eventId: parsed.eventId,
      photoId,
      objectKey: parsed.key,
      outcome: "ready_for_matching",
      mode: "upload",
    }),
  );
}

async function handler(event) {
  if (event && Array.isArray(event.Records)) {
    await Promise.all(event.Records.map(handleUploadedRecord));

    return {
      processedRecords: event.Records.length,
      outcome: "ok",
    };
  }

  const operation = event && typeof event.operation === "string" ? event.operation : "processReadyPhotos";
  if (operation === "processReadyPhotos") {
    return processPhotos({
      forceReprocess: event.forceReprocess === true,
      eventSlug: typeof event.eventSlug === "string" ? event.eventSlug : undefined,
      eventId: typeof event.eventId === "string" ? event.eventId : undefined,
      photoId: typeof event.photoId === "string" ? event.photoId : undefined,
      limit: typeof event.limit === "number" ? event.limit : undefined,
    });
  }

  return {
    statusCode: 400,
    errorMessage: "Unsupported event photo worker operation",
  };
}

module.exports = { handler };
