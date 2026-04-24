/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { createHmac } = require("node:crypto");
const { timingSafeEqual } = require("node:crypto");
const { GetObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { GetSecretValueCommand, SecretsManagerClient } = require("@aws-sdk/client-secrets-manager");
const { SendEmailCommand, SESv2Client } = require("@aws-sdk/client-sesv2");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { Client } = require("pg");

const { getRequiredEnv } = require("./lib");

const env = getRequiredEnv(process.env);
const secretsClient = new SecretsManagerClient({ region: env.awsRegion });
const sesClient = new SESv2Client({ region: env.awsRegion });
const s3Client = new S3Client({ region: env.awsRegion });
const PHOTO_RESPONSE_CONTENT_TYPE = "image/jpeg";

let cachedDatabaseConfig = null;
let cachedSigningSecret = null;

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function createToken(input) {
  const payload = {
    sub: input.attendeeId,
    eventId: input.eventId,
    faceId: input.faceId,
    action: input.action,
    exp: Math.floor(Date.now() / 1000) + env.linkTtlDays * 24 * 60 * 60,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", cachedSigningSecret)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function decodePayload(encoded) {
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);

    if (
      typeof parsed.sub !== "string" ||
      typeof parsed.eventId !== "string" ||
      typeof parsed.faceId !== "string" ||
      (parsed.action !== "gallery" && parsed.action !== "unsubscribe") ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function verifyToken(token, expectedAction) {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", cachedSigningSecret)
    .update(encodedPayload)
    .digest("base64url");

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  const payload = decodePayload(encodedPayload);
  if (!payload || payload.action !== expectedAction) {
    return null;
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

function getEventPhotosBucketName() {
  if (!env.eventPhotosBucketName) {
    throw new Error("FACE_LOCATOR_EVENT_PHOTOS_BUCKET is required.");
  }

  return env.eventPhotosBucketName;
}

function buildEmailBody(input) {
  const safeBaseUrl = trimTrailingSlash(input.publicBaseUrl);
  const galleryToken = createToken({
    attendeeId: input.attendeeId,
    eventId: input.eventId,
    faceId: input.faceId,
    action: "gallery",
  });
  const unsubscribeToken = createToken({
    attendeeId: input.attendeeId,
    eventId: input.eventId,
    faceId: input.faceId,
    action: "unsubscribe",
  });

  const galleryUrl = `${safeBaseUrl}/events/${encodeURIComponent(
    input.eventId,
  )}/faces/${encodeURIComponent(input.faceId)}?token=${encodeURIComponent(galleryToken)}`;
  const unsubscribeUrl = `${safeBaseUrl}/api/notifications/unsubscribe?eventId=${encodeURIComponent(
    input.eventId,
  )}&faceId=${encodeURIComponent(input.faceId)}&token=${encodeURIComponent(
    unsubscribeToken,
  )}`;

  return {
    subject: `${input.eventTitle}: ${input.matchCount} matched photo${input.matchCount === 1 ? "" : "s"}`,
    text: `Hi ${input.attendeeName},

We found ${input.matchCount} photo${input.matchCount === 1 ? "" : "s"} with your face at ${input.eventTitle}.

View your photos:
${galleryUrl}

If you no longer want emails for this event, unsubscribe here:
${unsubscribeUrl}`,
  };
}

async function buildGalleryPageData(client, payload) {
  const attendeeRes = await client.query(
    `
      SELECT a.name AS "attendeeName"
      FROM attendees a
      WHERE a.id = $1
      LIMIT 1
    `,
    [payload.sub],
  );

  const attendee = attendeeRes.rows[0];
  if (!attendee) {
    return null;
  }

  const photoRes = await client.query(
    `
      SELECT DISTINCT ep.object_key AS "objectKey"
      FROM photo_face_matches m
      JOIN event_photos ep ON ep.id = m.event_photo_id
      JOIN face_enrollments fe ON fe.id = m.face_enrollment_id
      WHERE ep.event_id = $1
        AND m.attendee_id = $2
        AND fe.rekognition_face_id = $3
        AND ep.deleted_at IS NULL
      ORDER BY ep.object_key DESC
    `,
    [payload.eventId, payload.sub, payload.faceId],
  );

  const photoUrls = await Promise.all(
    photoRes.rows.map(async (row) =>
      getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: getEventPhotosBucketName(),
          Key: row.objectKey,
          ResponseContentType: PHOTO_RESPONSE_CONTENT_TYPE,
        }),
        {
          expiresIn: 15 * 60,
        },
      ),
    ),
  );

  return {
    attendeeName: attendee.attendeeName,
    photoUrls,
  };
}

async function unsubscribeFromMatchedPhotos(client, payload) {
  await client.query(
    `
      UPDATE event_attendees
      SET photo_notifications_unsubscribed_at = COALESCE(photo_notifications_unsubscribed_at, now()),
          updated_at = now()
      WHERE event_id = $1
        AND attendee_id = $2
    `,
    [payload.eventId, payload.sub],
  );

  return {
    unsubscribed: true,
  };
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

async function getSigningSecret() {
  if (cachedSigningSecret) {
    return cachedSigningSecret;
  }

  const response = await secretsClient.send(
    new GetSecretValueCommand({
      SecretId: env.signingSecretArn,
    }),
  );

  cachedSigningSecret = response.SecretString;
  return cachedSigningSecret;
}

async function withDatabase(callback) {
  const config = await getDatabaseConfig();
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

async function getNotificationCandidates(client, options = {}) {
  const whereParts = ["ea.photo_notifications_unsubscribed_at IS NULL"];
  const values = [];
  let nextParam = 1;

  if (options.eventSlug) {
    whereParts.push(`e.slug = $${nextParam++}`);
    values.push(options.eventSlug);
  }

  if (options.eventId) {
    whereParts.push(`ea.event_id = $${nextParam++}`);
    values.push(options.eventId);
  }

  if (options.attendeeId) {
    whereParts.push(`ea.attendee_id = $${nextParam++}`);
    values.push(options.attendeeId);
  }

  if (!options.includeAlreadyNotified) {
    whereParts.push("n.id IS NULL");
  }

  const limitClause = options.limit ? `LIMIT $${nextParam++}` : "";
  if (options.limit) {
    values.push(Number(options.limit));
  }

  const result = await client.query(
    `
      SELECT
        ea.event_id AS "eventId",
        ea.attendee_id AS "attendeeId",
        a.email AS "attendeeEmail",
        a.name AS "attendeeName",
        e.title AS "eventTitle",
        e.public_base_url AS "publicBaseUrl",
        current_face.id AS "faceEnrollmentId",
        current_face.rekognition_face_id AS "faceId",
        COUNT(DISTINCT ep.id)::int AS "matchCount"
      FROM event_attendees ea
      JOIN attendees a
        ON a.id = ea.attendee_id
      JOIN events e
        ON e.id = ea.event_id
      JOIN consents c
        ON c.id = ea.consent_id
       AND c.withdrawn_at IS NULL
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
      LEFT JOIN matched_photo_notifications n
        ON n.event_id = ea.event_id
       AND n.attendee_id = ea.attendee_id
      WHERE ${whereParts.join("\n        AND ")}
        AND a.email IS NOT NULL
      GROUP BY
        ea.event_id,
        ea.attendee_id,
        a.email,
        a.name,
        e.title,
        e.public_base_url,
        current_face.id,
        current_face.rekognition_face_id
      ${limitClause}
    `,
    values,
  );

  return result.rows;
}

async function sendNotification(candidate) {
  const content = buildEmailBody(candidate);

  const response = await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: env.sesFromEmail,
      Destination: {
        ToAddresses: [candidate.attendeeEmail],
      },
      Content: {
        Simple: {
          Subject: {
            Data: content.subject,
            Charset: "UTF-8",
          },
          Body: {
            Text: {
              Data: content.text,
              Charset: "UTF-8",
            },
          },
        },
      },
    }),
  );

  return response.MessageId || null;
}

async function persistNotification(client, candidate, providerMessageId) {
  await client.query(
    `
      INSERT INTO matched_photo_notifications (
        id,
        event_id,
        attendee_id,
        face_enrollment_id,
        match_count,
        provider_message_id,
        sent_at
      ) VALUES (
        gen_random_uuid()::text,
        $1,
        $2,
        $3,
        $4,
        $5,
        now()
      )
      ON CONFLICT (event_id, attendee_id) DO UPDATE
      SET
        face_enrollment_id = excluded.face_enrollment_id,
        match_count = excluded.match_count,
        provider_message_id = excluded.provider_message_id,
        sent_at = now()
    `,
    [
      candidate.eventId,
      candidate.attendeeId,
      candidate.faceEnrollmentId,
      candidate.matchCount,
      providerMessageId,
    ],
  );
}

async function processCandidate(client, candidate, options = {}) {
  await client.query("BEGIN");
  try {
    const lockRes = await client.query(
      `SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked`,
      [`${candidate.eventId}:${candidate.attendeeId}`],
    );

    if (!lockRes.rows[0]?.locked) {
      await client.query("ROLLBACK");
      return { outcome: "skipped_locked" };
    }

    const existingRes = await client.query(
      `
        SELECT 1
        FROM matched_photo_notifications
        WHERE event_id = $1
          AND attendee_id = $2
        LIMIT 1
      `,
      [candidate.eventId, candidate.attendeeId],
    );

    if (existingRes.rowCount > 0 && !options.forceResend) {
      await client.query("ROLLBACK");
      return { outcome: "skipped_already_notified" };
    }

    const providerMessageId = await sendNotification(candidate);
    await persistNotification(client, candidate, providerMessageId);
    await client.query("COMMIT");

    return { outcome: "sent", providerMessageId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function processCandidates(client, candidates, options = {}) {
  const summary = {
    scanned: candidates.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  for (const candidate of candidates) {
    try {
      const result = await processCandidate(client, candidate, options);
      if (result.outcome === "sent") {
        summary.sent += 1;
      } else {
        summary.skipped += 1;
      }

      console.info(
        JSON.stringify({
          eventId: candidate.eventId,
          attendeeId: candidate.attendeeId,
          faceId: candidate.faceId,
          outcome: result.outcome,
        }),
      );
    } catch (error) {
      summary.failed += 1;
      console.error(
        JSON.stringify({
          scope: "lambda.matched-photo-notifier",
          level: "error",
          operation: "processCandidateMatch",
          statusCode: 500,
          backendMode: "lambda",
          requestId:
            (typeof options.requestId === "string" && options.requestId) ||
            (typeof options.awsRequestId === "string" && options.awsRequestId) ||
            null,
          eventId: candidate.eventId,
          attendeeId: candidate.attendeeId,
          faceId: candidate.faceId,
          outcome: "failed",
          troubleshootingHint:
            "Check SES send permissions/quota, signing secret access, and DB connectivity for matched_photo_notifications upsert.",
          error:
            error instanceof Error
              ? { name: error.name, message: error.message, stack: error.stack }
              : { message: String(error) },
        }),
      );
    }
  }

  return summary;
}

async function handler(event = {}) {
  await getSigningSecret();

  return withDatabase(async (client) => {
    if (event.operation === "getGalleryPageData") {
      const payload = event.input || {};
      const token = String(payload.token || "").trim();
      const tokenPayload = verifyToken(token, "gallery");

      if (
        !tokenPayload ||
        (typeof payload.eventId === "string" && payload.eventId.trim() && tokenPayload.eventId !== payload.eventId.trim()) ||
        (typeof payload.faceId === "string" && payload.faceId.trim() && tokenPayload.faceId !== payload.faceId.trim())
      ) {
        return {
          statusCode: 404,
          errorMessage: "Invalid link.",
        };
      }

      const galleryData = await buildGalleryPageData(client, tokenPayload);
      if (!galleryData) {
        return {
          statusCode: 404,
          errorMessage: "Gallery not found.",
        };
      }

      return galleryData;
    }

    if (event.operation === "unsubscribeFromMatchedPhotos") {
      const payload = event.input || {};
      const token = String(payload.token || "").trim();
      const tokenPayload = verifyToken(token, "unsubscribe");

      if (
        !tokenPayload ||
        (typeof payload.eventId === "string" && payload.eventId.trim() && tokenPayload.eventId !== payload.eventId.trim()) ||
        (typeof payload.faceId === "string" && payload.faceId.trim() && tokenPayload.faceId !== payload.faceId.trim())
      ) {
        return {
          statusCode: 404,
          errorMessage: "Invalid link.",
        };
      }

      return unsubscribeFromMatchedPhotos(client, tokenPayload);
    }

    if (event.operation === "sendSingleNotification") {
      const payload = event.input || {};
      const attendeeId = String(payload.attendeeId || "").trim();
      const eventSlug = String(payload.eventSlug || "").trim();
      const eventId = String(payload.eventId || "").trim();

      if (!attendeeId || (!eventSlug && !eventId)) {
        return {
          statusCode: 400,
          errorMessage: "attendeeId and eventSlug (or eventId) are required",
        };
      }

      const candidates = await getNotificationCandidates(client, {
        attendeeId,
        eventSlug: eventSlug || undefined,
        eventId: eventId || undefined,
        includeAlreadyNotified: payload.forceResend === true,
        limit: 1,
      });

      if (candidates.length === 0) {
        return {
          scanned: 0,
          sent: 0,
          skipped: 0,
          failed: 0,
          reason: "candidate_not_found",
        };
      }

      return processCandidates(client, candidates, {
        forceResend: payload.forceResend === true,
        requestId:
          (typeof payload.requestId === "string" && payload.requestId) ||
          (typeof event.requestId === "string" && event.requestId) ||
          null,
        awsRequestId: typeof event.awsRequestId === "string" ? event.awsRequestId : null,
      });
    }

    const candidates = await getNotificationCandidates(client);
    return processCandidates(client, candidates, {
      requestId: typeof event.requestId === "string" ? event.requestId : null,
      awsRequestId: typeof event.awsRequestId === "string" ? event.awsRequestId : null,
    });
  });
}

module.exports = {
  handler,
};
