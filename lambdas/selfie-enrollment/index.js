/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { GetSecretValueCommand, SecretsManagerClient } = require("@aws-sdk/client-secrets-manager");
const { IndexFacesCommand, RekognitionClient } = require("@aws-sdk/client-rekognition");
const { HeadObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { Client } = require("pg");

const { getRequiredEnv, parseSelfieRecord } = require("./lib");

const env = getRequiredEnv(process.env);
const s3Client = new S3Client({ region: env.awsRegion });
const rekognitionClient = new RekognitionClient({ region: env.awsRegion });
const secretsClient = new SecretsManagerClient({ region: env.awsRegion });

let cachedDatabaseConfig = null;

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
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function persistEnrollment(result) {
  return withDatabase(async (client) => {
    await client.query(
      `
        insert into face_enrollments (
          id,
          event_id,
          attendee_id,
          registration_id,
          selfie_object_key,
          rekognition_face_id,
          external_image_id,
          status,
          enrolled_at
        ) values (
          gen_random_uuid()::text,
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          'enrolled',
          now()
        )
      `,
      [
        result.eventId,
        result.attendeeId,
        result.registrationId,
        result.key,
        result.faceId,
        result.externalImageId,
      ],
    );

    await client.query(
      `
        update event_attendees
        set enrollment_status = 'enrolled', updated_at = now()
        where event_id = $1 and attendee_id = $2
      `,
      [result.eventId, result.attendeeId],
    );
  });
}

async function handleRecord(record) {
  const parsed = parseSelfieRecord(record);
  if (!parsed) {
    console.warn(JSON.stringify({ outcome: "skipped", reason: "unsupported_selfie_key", record }));
    return;
  }

  const head = await s3Client.send(
    new HeadObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.key,
    }),
  );

  const registrationId = head.Metadata?.["registration-id"] || "unknown-registration";
  const externalImageId = `${parsed.eventId}:${parsed.attendeeId}`;

  const response = await rekognitionClient.send(
    new IndexFacesCommand({
      CollectionId: env.rekognitionCollectionId,
      ExternalImageId: externalImageId,
      DetectionAttributes: [],
      Image: {
        S3Object: {
          Bucket: parsed.bucket,
          Name: parsed.key,
        },
      },
    }),
  );

  const faceId = response.FaceRecords?.[0]?.Face?.FaceId;
  if (!faceId) {
    throw new Error(`No face enrollment record was created for ${parsed.key}`);
  }

  await persistEnrollment({
    ...parsed,
    externalImageId,
    faceId,
    registrationId,
  });

  console.info(
    JSON.stringify({
      eventId: parsed.eventId,
      objectKey: parsed.key,
      outcome: "enrolled",
      registrationId,
      attendeeId: parsed.attendeeId,
    }),
  );
}

async function handler(event) {
  const records = event?.Records || [];
  await Promise.all(records.map(handleRecord));

  return {
    processedRecords: records.length,
    outcome: "ok",
  };
}

module.exports = { handler };
