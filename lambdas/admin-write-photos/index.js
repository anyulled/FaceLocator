/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { createHash, randomUUID } = require("node:crypto");
const { DeleteObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { Client } = require("pg");

const { getDatabaseConfig, getRequiredEnv } = require("./lib");

const env = getRequiredEnv(process.env);
const s3Client = new S3Client({ region: env.awsRegion });

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

async function deleteObjectFromS3(objectKey) {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: env.eventPhotosBucketName,
      Key: objectKey,
    }),
  );
}

async function insertDeleteAudit(input) {
  return withDatabase(async (client) => {
    await client.query(
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
        input.eventPhotoId || null,
        input.result,
        input.errorMessage || null,
      ],
    );
  });
}

async function deleteAdminEventPhoto(input) {
  const requestId = input.requestId || randomUUID();

  return withDatabase(async (client) => {
    try {
      await client.query("BEGIN");

      const rowRes = await client.query(
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
    }
  });
}

function hashBatchDeleteRequest(eventSlug, photoIds) {
  const canonicalPayload = JSON.stringify({
    eventSlug,
    photoIds: [...photoIds].sort(),
  });

  return createHash("sha256").update(canonicalPayload).digest("hex");
}

async function getIdempotencyReplay(eventSlug, idempotencyKey) {
  return withDatabase(async (client) => {
    const result = await client.query(
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

    return result.rows[0] || null;
  });
}

async function storeIdempotencyReplay(input) {
  return withDatabase(async (client) => {
    await client.query(
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
  });
}

async function deleteAdminEventPhotosBatch(input) {
  const requestHash = hashBatchDeleteRequest(input.eventSlug, input.photoIds);
  const existingReplay = await getIdempotencyReplay(input.eventSlug, input.idempotencyKey);
  if (existingReplay) {
    if (existingReplay.requestHash !== requestHash) {
      throw new Error("IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD");
    }

    return existingReplay.responsePayload;
  }

  const requestId = `${input.idempotencyKey}:${randomUUID()}`;
  const results = [];

  for (const photoId of input.photoIds) {
    results.push(
      await deleteAdminEventPhoto({
        eventSlug: input.eventSlug,
        photoId,
        actorSub: input.actorSub,
        requestId,
      }),
    );
  }

  const summary = {
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
      error.code === "23505";

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
}

async function handler(event) {
  try {
    if (!event) {
      return { statusCode: 400, errorMessage: "Missing admin write operation" };
    }

    if (event.operation === "deleteAdminEventPhoto") {
      return await deleteAdminEventPhoto(event.input);
    }

    if (event.operation === "deleteAdminEventPhotosBatch") {
      return await deleteAdminEventPhotosBatch(event.input);
    }

    return { statusCode: 400, errorMessage: "Unsupported admin photo write operation" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD") {
      return { statusCode: 409, errorMessage: "Idempotency-Key cannot be reused with a different payload" };
    }

    return { statusCode: 500, errorMessage: message };
  }
}

module.exports = { handler };
