"use strict";

const SELFIE_RECORD_PATTERN = /^events\/([^/]+)\/attendees\/([^/]+)\/([^/]+)$/;

function parseSelfieRecord(record) {
  const bucket = record?.s3?.bucket?.name;
  const rawKey = record?.s3?.object?.key;

  if (!bucket || !rawKey) {
    return null;
  }

  const key = decodeURIComponent(rawKey.replace(/\+/g, " "));
  const match = key.match(SELFIE_RECORD_PATTERN);

  if (!match) {
    return null;
  }

  return {
    bucket,
    key,
    eventId: match[1],
    attendeeId: match[2],
    fileName: match[3],
  };
}

function getRequiredEnv(env) {
  const requiredKeys = [
    "AWS_REGION",
    "SELFIES_BUCKET_NAME",
    "REKOGNITION_COLLECTION_ID",
    "DATABASE_SECRET_NAME",
  ];

  const missing = requiredKeys.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    awsRegion: env.AWS_REGION,
    selfiesBucketName: env.SELFIES_BUCKET_NAME,
    rekognitionCollectionId: env.REKOGNITION_COLLECTION_ID,
    databaseSecretName: env.DATABASE_SECRET_NAME,
    databaseSecretArn: env.DATABASE_SECRET_ARN || null,
    logLevel: env.LOG_LEVEL || "info",
  };
}

module.exports = {
  getRequiredEnv,
  parseSelfieRecord,
};
