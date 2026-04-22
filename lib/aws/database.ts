import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { Pool } from "pg";

import { DatabaseOperationError } from "@/lib/aws/database-errors";

let cachedPool: Pool | null = null;

function getDatabaseSecretId() {
  return (
    process.env.FACE_LOCATOR_DATABASE_SECRET_ARN ||
    process.env.DATABASE_SECRET_ARN ||
    process.env.FACE_LOCATOR_DATABASE_SECRET_NAME ||
    process.env.DATABASE_SECRET_NAME ||
    process.env.FACE_LOCATOR_DATABASE_SECRET ||
    "face-locator-poc-database"
  );
}

export async function getDatabasePool(): Promise<Pool> {
  const isTestRuntime =
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.PLAYWRIGHT_TEST_BASE_URL) ||
    process.env.TEST_WORKER_INDEX !== undefined;

  if (cachedPool && !isTestRuntime) {
    return cachedPool;
  }

  const region = process.env.AWS_REGION || "eu-west-1";
  const secretId = getDatabaseSecretId();

  let config;
  try {
    const secretsClient = new SecretsManagerClient({ region });
    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: secretId,
      })
    );
    config = JSON.parse(response.SecretString!);
  } catch (err) {
    const error = new DatabaseOperationError({
      operation: "database.getPool",
      kind: "configuration",
      status: 500,
      message:
        "Database configuration is unavailable while loading the connection pool. Troubleshooting: check the database secret name, host, database name, username, and password stored in Secrets Manager.",
      troubleshooting:
        "Check the database secret name, host, database name, username, and password stored in Secrets Manager.",
      details: {
        region,
        secretId,
      },
      cause: err,
    });

    console.error(
      JSON.stringify({
        scope: "database",
        level: "error",
        message: error.message,
        operation: error.operation,
        kind: error.kind,
        status: error.status,
        troubleshooting: error.troubleshooting,
        context: error.context,
        details: error.details,
        error: error.cause instanceof Error
          ? { name: error.cause.name, message: error.cause.message, stack: error.cause.stack }
          : { message: String(error.cause) },
      }),
    );
    throw error;
  }

  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.dbname,
    user: config.username,
    password: config.password,
    ssl: { rejectUnauthorized: false },
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 7000,
    query_timeout: 7000,
  });

  pool.on("error", (error) => {
    console.error(
      JSON.stringify({
        scope: "database",
        level: "error",
        message: "Unexpected PostgreSQL pool error",
        operation: "database.pool",
        kind: "connectivity",
        status: 503,
        troubleshooting:
          "Check private RDS reachability, security groups, subnet routes, the database secret, and whether the instance is healthy.",
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
      }),
    );
  });

  if (!isTestRuntime) {
    cachedPool = pool;
  }

  return pool;
}
