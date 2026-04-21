import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { Pool } from "pg";

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
    console.error("Failed to fetch database secret from Secrets Manager", err);
    throw new Error("Database configuration unavailable");
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
        scope: "database-pool",
        level: "error",
        message: "Unexpected PostgreSQL pool error",
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
