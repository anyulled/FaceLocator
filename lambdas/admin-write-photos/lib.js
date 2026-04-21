"use strict";

const { GetSecretValueCommand, SecretsManagerClient } = require("@aws-sdk/client-secrets-manager");

function getRequiredEnv(env) {
  const requiredKeys = ["AWS_REGION", "FACE_LOCATOR_EVENT_PHOTOS_BUCKET", "DATABASE_SECRET_NAME"];
  const missing = requiredKeys.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    awsRegion: env.AWS_REGION,
    eventPhotosBucketName: env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET,
    databaseSecretName: env.DATABASE_SECRET_NAME,
    databaseSecretArn: env.DATABASE_SECRET_ARN || null,
  };
}

let cachedDatabaseConfig = null;

async function getDatabaseConfig(env) {
  if (cachedDatabaseConfig) {
    return cachedDatabaseConfig;
  }

  const client = new SecretsManagerClient({ region: env.awsRegion });
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
