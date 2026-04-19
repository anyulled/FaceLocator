"use strict";

const EVENT_PHOTO_RECORD_PATTERN = /^events\/pending\/([^/]+)\/photos\/([^/]+)$/;

function parseEventPhotoRecord(record) {
  const bucket = record?.s3?.bucket?.name;
  const rawKey = record?.s3?.object?.key;

  if (!bucket || !rawKey) {
    return null;
  }

  const key = decodeURIComponent(rawKey.replace(/\+/g, " "));
  const match = key.match(EVENT_PHOTO_RECORD_PATTERN);

  if (!match) {
    return null;
  }

  return {
    bucket,
    key,
    eventId: match[1],
    fileName: match[2],
  };
}

function getRequiredEnv(env) {
  const requiredKeys = [
    "AWS_REGION",
    "EVENT_PHOTOS_BUCKET_NAME",
    "REKOGNITION_COLLECTION_ID",
    "DATABASE_SECRET_NAME",
  ];

  const missing = requiredKeys.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    awsRegion: env.AWS_REGION,
    eventPhotosBucketName: env.EVENT_PHOTOS_BUCKET_NAME,
    rekognitionCollectionId: env.REKOGNITION_COLLECTION_ID,
    databaseSecretName: env.DATABASE_SECRET_NAME,
    databaseSecretArn: env.DATABASE_SECRET_ARN || null,
    searchFacesOnUpload: env.SEARCH_FACES_ON_UPLOAD === "true",
    logLevel: env.LOG_LEVEL || "info",
  };
}

module.exports = {
  getRequiredEnv,
  parseEventPhotoRecord,
};
