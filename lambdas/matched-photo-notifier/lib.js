"use strict";

function getRequiredEnv(env) {
  const requiredKeys = [
    "AWS_REGION",
    "DATABASE_SECRET_NAME",
    "SES_FROM_EMAIL",
    "MATCH_LINK_SIGNING_SECRET_ARN",
  ];

  const missing = requiredKeys.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const configuredTtlDays = Number(env.MATCH_LINK_TTL_DAYS || "30");
  const linkTtlDays =
    Number.isFinite(configuredTtlDays) && configuredTtlDays > 0
      ? Math.floor(configuredTtlDays)
      : 30;

  return {
    awsRegion: env.AWS_REGION,
    databaseSecretName: env.DATABASE_SECRET_NAME,
    databaseSecretArn: env.DATABASE_SECRET_ARN || null,
    sesFromEmail: env.SES_FROM_EMAIL,
    signingSecretArn: env.MATCH_LINK_SIGNING_SECRET_ARN,
    linkTtlDays,
    logLevel: env.LOG_LEVEL || "info",
  };
}

module.exports = {
  getRequiredEnv,
};
