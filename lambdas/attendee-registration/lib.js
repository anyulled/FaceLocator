/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { GetSecretValueCommand, SecretsManagerClient } = require("@aws-sdk/client-secrets-manager");

function getRequiredEnv(env) {
  return {
    awsRegion: env.AWS_REGION || "eu-west-1",
    databaseSecretId:
      env.FACE_LOCATOR_DATABASE_SECRET_ARN ||
      env.DATABASE_SECRET_ARN ||
      env.FACE_LOCATOR_DATABASE_SECRET_NAME ||
      env.DATABASE_SECRET_NAME ||
      env.FACE_LOCATOR_DATABASE_SECRET ||
      "face-locator-poc-database",
    publicBaseUrl: env.FACE_LOCATOR_PUBLIC_BASE_URL || "https://localhost:3000",
    selfiesBucketName: env.FACE_LOCATOR_SELFIES_BUCKET || env.SELFIES_BUCKET_NAME || "",
    eventLogosBucketName: env.FACE_LOCATOR_EVENT_LOGOS_BUCKET || "",
  };
}

async function getDatabaseConfig(env) {
  const client = new SecretsManagerClient({ region: env.awsRegion });
  const response = await client.send(
    new GetSecretValueCommand({
      SecretId: env.databaseSecretId,
    }),
  );

  return JSON.parse(response.SecretString);
}

module.exports = { getDatabaseConfig, getRequiredEnv };
