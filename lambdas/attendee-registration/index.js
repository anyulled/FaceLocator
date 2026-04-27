/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { Client } = require("pg");

const { getDatabaseConfig, getRequiredEnv } = require("./lib");

const env = getRequiredEnv(process.env);
const s3Client = new S3Client({ region: env.awsRegion });
const CONSENT_TEXT_VERSION = "2026-04-19";
const CONSENT_TEXT =
  "I consent to FaceLocator using my selfie for facial matching against event photos and for later delivery of matched photos.";

const CONNECTIVITY_CODES = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "ECONNRESET",
]);

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function sanitizeSegment(value) {
  return String(value || "").trim().replace(/\s+/g, "-").toLowerCase();
}

function buildSelfieObjectKey(input) {
  return `events/${sanitizeSegment(input.eventId)}/attendees/${sanitizeSegment(
    input.attendeeId,
  )}/${sanitizeSegment(input.fileName)}`;
}

function parseSelfieObjectKey(key) {
  const match = String(key || "").match(/^events\/([^/]+)\/attendees\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return null;
  }

  return {
    eventId: match[1],
    attendeeId: match[2],
    fileName: match[3],
  };
}

function mapDatabaseStatus(status) {
  switch (status) {
    case "enrolled":
      return "ENROLLED";
    case "failed":
      return "FAILED";
    case "cancelled":
      return "CANCELLED";
    case "processing":
      return "PROCESSING";
    case "pending":
    default:
      return "UPLOAD_PENDING";
  }
}

function buildPublicS3ObjectUrl(bucketName, objectKey) {
  const region = (env.awsRegion || "eu-west-1").trim();
  const encodedKey = String(objectKey || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  if (!bucketName || !encodedKey) {
    return undefined;
  }

  if (region === "us-east-1") {
    return `https://${bucketName}.s3.amazonaws.com/${encodedKey}`;
  }
  return `https://${bucketName}.s3.${region}.amazonaws.com/${encodedKey}`;
}

function statusMessage(status) {
  switch (status) {
    case "UPLOAD_PENDING":
      return "Your registration was created. Selfie upload can start now.";
    case "PROCESSING":
      return "We are checking your selfie and preparing enrollment.";
    case "ENROLLED":
      return "Your selfie has been registered.";
    case "FAILED":
      return "We hit a snag while processing your registration.";
    case "CANCELLED":
      return "This registration is no longer active.";
    default:
      return "Your registration was created. Selfie upload can start now.";
  }
}

function apiError(statusCode, code, message, field) {
  return {
    statusCode,
    error: {
      code,
      message,
      ...(field ? { field } : {}),
    },
  };
}

function classifyError(error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code || "") : "";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (code && (CONNECTIVITY_CODES.has(code) || code.startsWith("57P") || code === "53300")) {
    return apiError(
      503,
      "INTERNAL_ERROR",
      "Registration database connection failed. Check private RDS reachability, security groups, subnet routes, and whether the instance is healthy.",
    );
  }

  if (
    code === "28P01" ||
    code === "3D000" ||
    message.includes("accessdenied") ||
    message.includes("secretsmanager") ||
    message.includes("secret") ||
    message.includes("password authentication failed")
  ) {
    return apiError(
      500,
      "INTERNAL_ERROR",
      "Registration database configuration is unavailable. Check the database secret.",
    );
  }

  if (message.includes("timeout") || message.includes("connection") || message.includes("network")) {
    return apiError(
      503,
      "INTERNAL_ERROR",
      "Registration database connection failed. Check private RDS reachability, security groups, subnet routes, and whether the instance is healthy.",
    );
  }

  return apiError(500, "INTERNAL_ERROR", "Registration backend failed.");
}

async function withDatabase(callback) {
  const config = await getDatabaseConfig(env);
  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.dbname,
    user: config.username,
    password: config.password,
    ssl: true,
    connectionTimeoutMillis: 5000,
    statement_timeout: 7000,
    query_timeout: 7000,
  });

  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

function mapEvent(row, fallbackSlug) {
  if (!row) {
    return null;
  }

  return {
    slug: String(row.slug || fallbackSlug || "").trim(),
    title: String(row.title || row.slug || fallbackSlug || "").trim(),
    venue: String(row.venue || "").trim(),
    scheduledAt: row.scheduledAt ? new Date(row.scheduledAt).toISOString() : "",
    endsAt: row.endsAt ? new Date(row.endsAt).toISOString() : undefined,
    description: String(row.description || "").trim(),
    logoUrl: buildPublicS3ObjectUrl(env.eventLogosBucketName, row.logoObjectKey),
  };
}

async function getEventBySlug(input) {
  const slug = String(input.slug || "").trim().toLowerCase();
  if (!slug) {
    return { event: null };
  }

  return withDatabase(async (client) => {
    const result = await client.query(
      `
        SELECT
          slug,
          title,
          venue,
          description,
          scheduled_at AS "scheduledAt",
          ends_at AS "endsAt",
          logo_object_key AS "logoObjectKey"
        FROM events
        WHERE slug = $1
        LIMIT 1
      `,
      [slug],
    );

    return { event: mapEvent(result.rows[0], slug) };
  });
}

async function createUploadInstructions(input) {
  const objectKey = buildSelfieObjectKey({
    eventId: input.eventSlug,
    attendeeId: input.attendeeId,
    fileName: input.fileName,
  });

  const command = new PutObjectCommand({
    Bucket: env.selfiesBucketName,
    Key: objectKey,
    ContentType: input.contentType,
    Metadata: {
      "attendee-id": input.attendeeId,
      "consent-version": CONSENT_TEXT_VERSION,
      "event-id": input.eventSlug,
      "registration-id": input.registrationId,
    },
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: 10 * 60,
    signableHeaders: new Set([
      "content-type",
      "x-amz-meta-attendee-id",
      "x-amz-meta-consent-version",
      "x-amz-meta-event-id",
      "x-amz-meta-registration-id",
    ]),
  });

  return {
    method: "PUT",
    url,
    headers: {
      "Content-Type": input.contentType,
    },
    objectKey,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

async function createRegistrationIntent(input) {
  return withDatabase(async (client) => {
    await client.query("BEGIN");

    try {
      const eventRes = await client.query(
        `SELECT id, slug, title FROM events WHERE slug = $1 LIMIT 1`,
        [input.eventSlug],
      );
      const event = eventRes.rows[0];
      if (!event) {
        await client.query("ROLLBACK");
        return apiError(404, "INVALID_EVENT", "This event registration page is not available.");
      }

      if (input.submissionKey) {
        const existingRes = await client.query(
          `
            SELECT
              registration_id AS "registrationId",
              attendee_id AS "attendeeId",
              selfie_object_key AS "selfieObjectKey",
              status
            FROM face_enrollments
            WHERE submission_key = $1
              AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [input.submissionKey],
        );

        const existing = existingRes.rows[0];
        if (existing) {
          const parsedObjectKey = parseSelfieObjectKey(existing.selfieObjectKey);
          const upload = await createUploadInstructions({
            registrationId: existing.registrationId,
            attendeeId: existing.attendeeId,
            eventSlug: event.slug,
            fileName: parsedObjectKey?.fileName || input.fileName,
            contentType: input.contentType,
          });

          await client.query("COMMIT");

          return {
            registrationId: existing.registrationId,
            attendeeId: existing.attendeeId,
            upload,
            status: "UPLOAD_PENDING",
          };
        }
      }

      let attendeeId;
      const attendeeRes = await client.query(`SELECT id FROM attendees WHERE email = $1`, [input.email]);
      if (attendeeRes.rows.length > 0) {
        attendeeId = attendeeRes.rows[0].id;
        await client.query(`UPDATE attendees SET name = $2 WHERE id = $1`, [attendeeId, input.name]);
      } else {
        attendeeId = makeId("att");
        await client.query(`INSERT INTO attendees (id, email, name) VALUES ($1, $2, $3)`, [
          attendeeId,
          input.email,
          input.name,
        ]);
      }

      const consentId = makeId("consent");
      await client.query(
        `
          INSERT INTO consents (
            id,
            event_id,
            attendee_id,
            consent_text_version,
            consent_text,
            granted_at
          ) VALUES ($1, $2, $3, $4, $5, now())
        `,
        [consentId, event.id, attendeeId, CONSENT_TEXT_VERSION, CONSENT_TEXT],
      );

      await client.query(
        `
          INSERT INTO event_attendees (event_id, attendee_id, consent_id, enrollment_status)
          VALUES ($1, $2, $3, 'pending')
          ON CONFLICT (event_id, attendee_id) DO UPDATE
          SET consent_id = EXCLUDED.consent_id,
              withdrawal_at = NULL,
              updated_at = now()
        `,
        [event.id, attendeeId, consentId],
      );

      const registrationId = makeId("reg");
      const upload = await createUploadInstructions({
        registrationId,
        attendeeId,
        eventSlug: event.slug,
        fileName: input.fileName,
        contentType: input.contentType,
      });

      await client.query(
        `
          INSERT INTO face_enrollments (
            id,
            event_id,
            attendee_id,
            registration_id,
            submission_key,
            selfie_object_key,
            status
          ) VALUES (
            gen_random_uuid()::text,
            $1,
            $2,
            $3,
            $4,
            $5,
            'pending'
          )
        `,
        [event.id, attendeeId, registrationId, input.submissionKey || registrationId, upload.objectKey],
      );

      await client.query("COMMIT");

      return {
        registrationId,
        attendeeId,
        upload,
        status: "UPLOAD_PENDING",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function completeRegistration(input) {
  return withDatabase(async (client) => {
    const result = await client.query(
      `
        UPDATE face_enrollments
        SET status = CASE
          WHEN status = 'enrolled' THEN status
          ELSE 'processing'
        END
        WHERE registration_id = $1
          AND deleted_at IS NULL
        RETURNING event_id AS "eventId", attendee_id AS "attendeeId"
      `,
      [input.registrationId],
    );

    const record = result.rows[0];
    if (!record) {
      return apiError(404, "REGISTRATION_NOT_FOUND", "Registration not found.");
    }

    await client.query(
      `
        UPDATE event_attendees
        SET enrollment_status = 'processing', updated_at = now()
        WHERE event_id = $1
          AND attendee_id = $2
          AND enrollment_status <> 'enrolled'
      `,
      [record.eventId, record.attendeeId],
    );

    return {
      registrationId: input.registrationId,
      status: "PROCESSING",
      message: statusMessage("PROCESSING"),
    };
  });
}

async function getRegistrationStatus(input) {
  return withDatabase(async (client) => {
    const res = await client.query(
      `
        SELECT status
        FROM face_enrollments
        WHERE registration_id = $1
          AND deleted_at IS NULL
        ORDER BY
          CASE status
            WHEN 'enrolled' THEN 3
            WHEN 'processing' THEN 2
            WHEN 'pending' THEN 1
            ELSE 0
          END DESC,
          created_at DESC
        LIMIT 1
      `,
      [input.registrationId],
    );

    const record = res.rows[0];
    if (!record) {
      return apiError(404, "REGISTRATION_NOT_FOUND", "Registration not found.");
    }

    const status = mapDatabaseStatus(record.status);
    return {
      registrationId: input.registrationId,
      status,
      message: statusMessage(status),
    };
  });
}

async function handler(event) {
  try {
    const payload = event || {};
    if (payload.operation === "getEventBySlug") {
      return await getEventBySlug(payload.input || {});
    }

    if (payload.operation === "createRegistrationIntent") {
      return await createRegistrationIntent(payload.input || {});
    }

    if (payload.operation === "completeRegistration") {
      return await completeRegistration(payload.input || {});
    }

    if (payload.operation === "getRegistrationStatus") {
      return await getRegistrationStatus(payload.input || {});
    }

    return apiError(400, "INTERNAL_ERROR", "Unsupported attendee registration operation.");
  } catch (error) {
    const classified = classifyError(error);
    console.error(
      JSON.stringify({
        scope: "attendee-registration-lambda",
        level: "error",
        message: "Attendee registration lambda failed",
        operation: event && event.operation ? event.operation : "unknown",
        statusCode: classified.statusCode,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
      }),
    );
    return classified;
  }
}

module.exports = { handler };
