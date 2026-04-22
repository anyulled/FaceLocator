"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */
const { GetSecretValueCommand, SecretsManagerClient } = require("@aws-sdk/client-secrets-manager");

function getRequiredEnv(env) {
  const requiredKeys = ["AWS_REGION", "DATABASE_SECRET_NAME", "FACE_LOCATOR_EVENT_PHOTOS_BUCKET"];
  const missing = requiredKeys.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    awsRegion: env.AWS_REGION,
    databaseSecretName: env.DATABASE_SECRET_NAME,
    databaseSecretArn: env.DATABASE_SECRET_ARN || null,
    eventPhotosBucketName: env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET,
    publicBaseUrl: env.FACE_LOCATOR_PUBLIC_BASE_URL || null,
    logLevel: env.LOG_LEVEL || "info",
  };
}

function getSecretsClient(region) {
  return new SecretsManagerClient({ region });
}

let cachedDatabaseConfig = null;

async function getDatabaseConfig(env) {
  if (cachedDatabaseConfig) {
    return cachedDatabaseConfig;
  }

  const client = getSecretsClient(env.awsRegion);
  const response = await client.send(
    new GetSecretValueCommand({
      SecretId: env.databaseSecretArn || env.databaseSecretName,
    }),
  );

  cachedDatabaseConfig = JSON.parse(response.SecretString);
  return cachedDatabaseConfig;
}

module.exports = {
  getRequiredEnv,
  getDatabaseConfig,
};
