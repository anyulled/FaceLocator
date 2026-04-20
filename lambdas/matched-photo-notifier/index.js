/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { createHmac } = require("node:crypto");
const { GetSecretValueCommand, SecretsManagerClient } = require("@aws-sdk/client-secrets-manager");
const { SendEmailCommand, SESv2Client } = require("@aws-sdk/client-sesv2");
const { Client } = require("pg");

const { getRequiredEnv } = require("./lib");

const env = getRequiredEnv(process.env);
const secretsClient = new SecretsManagerClient({ region: env.awsRegion });
const sesClient = new SESv2Client({ region: env.awsRegion });

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

async function getNotificationCandidates(client) {
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
      WHERE ea.photo_notifications_unsubscribed_at IS NULL
        AND n.id IS NULL
      GROUP BY
        ea.event_id,
        ea.attendee_id,
        a.email,
        a.name,
        e.title,
        e.public_base_url,
        current_face.id,
        current_face.rekognition_face_id
    `,
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
      ON CONFLICT (event_id, attendee_id) DO NOTHING
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

async function processCandidate(client, candidate) {
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

    if (existingRes.rowCount > 0) {
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

async function handler() {
  await getSigningSecret();

  const summary = {
    scanned: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  return withDatabase(async (client) => {
    const candidates = await getNotificationCandidates(client);
    summary.scanned = candidates.length;

    for (const candidate of candidates) {
      try {
        const result = await processCandidate(client, candidate);
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
            eventId: candidate.eventId,
            attendeeId: candidate.attendeeId,
            faceId: candidate.faceId,
            outcome: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        );
      }
    }

    return summary;
  });
}

module.exports = {
  handler,
};
