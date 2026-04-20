/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { GetSecretValueCommand, SecretsManagerClient } = require("@aws-sdk/client-secrets-manager");
const { SearchFacesByImageCommand, RekognitionClient } = require("@aws-sdk/client-rekognition");
const { HeadObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { Client } = require("pg");

const { getRequiredEnv, parseEventPhotoRecord } = require("./lib");

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

async function persistPhotoRecord(input) {
  return withDatabase(async (client) => {
    await client.query(
      `
        insert into event_photos (
          id,
          event_id,
          object_key,
          status,
          uploaded_at
        ) values (
          $1,
          $2,
          $3,
          $4,
          now()
        )
        on conflict (id) do update
        set object_key = excluded.object_key,
            status = excluded.status
      `,
      [input.photoId, input.eventId, input.key, input.status],
    );

    for (const match of input.matches) {
      const matchRes = await client.query(
        `
          insert into photo_face_matches (
            id,
            event_photo_id,
            attendee_id,
            face_enrollment_id,
            similarity,
            created_at
          )
          select 
            gen_random_uuid()::text,
            $1,
            $2,
            id,
            $4,
            now()
          from face_enrollments
          where rekognition_face_id = $3
          on conflict (event_photo_id, attendee_id) do update
          set face_enrollment_id = excluded.face_enrollment_id,
              similarity = greatest(photo_face_matches.similarity, excluded.similarity)
          returning attendee_id
        `,
        [input.photoId, match.attendeeId, match.faceEnrollmentId, match.similarity],
      );

      if (matchRes.rows.length > 0) {
        const attendeeRes = await client.query(
          "select email, name from attendees where id = $1",
          [match.attendeeId]
        );
        if (attendeeRes.rows.length > 0) {
          const { email, name } = attendeeRes.rows[0];
          console.info(JSON.stringify({
            outcome: "notification_sent",
            type: "mock_email",
            to: email,
            recipientName: name,
            photoKey: input.objectKey
          }));
        }
      }
    }
  });
}

async function searchFaces(parsed) {
  if (!env.searchFacesOnUpload) {
    return [];
  }

  const response = await rekognitionClient.send(
    new SearchFacesByImageCommand({
      CollectionId: env.rekognitionCollectionId,
      FaceMatchThreshold: 90,
      MaxFaces: 10,
      Image: {
        S3Object: {
          Bucket: parsed.bucket,
          Name: parsed.key,
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

async function handleRecord(record) {
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
  const matches = await searchFaces(parsed);
  const status = matches.length > 0 ? "matches_found" : "ready_for_matching";

  await persistPhotoRecord({
    ...parsed,
    photoId,
    status,
    matches,
  });

  console.info(
    JSON.stringify({
      eventId: parsed.eventId,
      objectKey: parsed.key,
      photoId,
      outcome: status,
      matchCount: matches.length,
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
