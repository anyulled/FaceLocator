import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DeleteFacesCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { getDatabasePool } from "@/lib/aws/database";
import type { Pool, QueryResult, QueryResultRow } from "pg";

export const E2E_EVENT_ID = "speaker-session-2026";
export const E2E_SUCCESS_MESSAGE = /Your selfie has been registered/i;

export function getAwsRegion() {
  return process.env.AWS_REGION || "eu-west-1";
}

export function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable for E2E test: ${name}`);
  }
  return value;
}

export function getSelfiesBucketName() {
  return getRequiredEnv("FACE_LOCATOR_SELFIES_BUCKET");
}

export function getEventPhotosBucketName() {
  return getRequiredEnv("FACE_LOCATOR_EVENT_PHOTOS_BUCKET");
}

export function getRekognitionCollectionId() {
  const explicitId =
    process.env.FACE_LOCATOR_REKOGNITION_COLLECTION_ID || process.env.REKOGNITION_COLLECTION_ID;
  if (explicitId) {
    return explicitId;
  }

  const selfiesBucket = process.env.FACE_LOCATOR_SELFIES_BUCKET;
  if (selfiesBucket?.endsWith("-selfies")) {
    return `${selfiesBucket.slice(0, -"-selfies".length)}-faces`;
  }

  return "face-locator-poc-faces";
}

export function createAwsClients() {
  const region = getAwsRegion();
  return {
    s3: new S3Client({ region }),
    rekognition: new RekognitionClient({ region }),
  };
}

function getAttendeeRegistrationLambdaName() {
  return (
    process.env.FACE_LOCATOR_ATTENDEE_REGISTRATION_LAMBDA_NAME ||
    process.env.ATTENDEE_REGISTRATION_LAMBDA_NAME ||
    "face-locator-poc-attendee-registration"
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type LiveE2EPrerequisiteFailure = {
  ok: false;
  reason: string;
};

type LiveE2EPrerequisiteSuccess = {
  ok: true;
};

type LiveE2EPrerequisiteSuccessWithDatabase = {
  ok: true;
  pool: Pool;
};

export async function checkLiveE2EPrerequisites(
  options: { requireDatabase: true },
): Promise<LiveE2EPrerequisiteSuccessWithDatabase | LiveE2EPrerequisiteFailure>;
export async function checkLiveE2EPrerequisites(
  options?: { requireDatabase?: false },
): Promise<LiveE2EPrerequisiteSuccess | LiveE2EPrerequisiteFailure>;
export async function checkLiveE2EPrerequisites(options?: { requireDatabase?: boolean }) {
  const region = getAwsRegion();
  const lambdaName = getAttendeeRegistrationLambdaName();

  try {
    await new LambdaClient({ region }).send(
      new InvokeCommand({
        FunctionName: lambdaName,
        InvocationType: "DryRun",
        Payload: Buffer.from(JSON.stringify({ operation: "healthcheck" })),
      }),
    );
  } catch (error) {
    return {
      ok: false as const,
      reason:
        `Skipping live E2E: GitHub Actions role cannot invoke ${lambdaName}. `
        + `Configure lambda:InvokeFunction for attendee registration. `
        + `Details: ${getErrorMessage(error)}`,
    };
  }

  if (!options?.requireDatabase) {
    return { ok: true as const };
  }

  try {
    const pool = await getDatabasePool();
    await pool.query("SELECT 1");
    return {
      ok: true as const,
      pool,
    };
  } catch (error) {
    return {
      ok: false as const,
      reason:
        "Skipping live E2E: direct database connectivity is unavailable from the runner. "
        + `Details: ${getErrorMessage(error)}`,
    };
  }
}

export async function pollForQueryRow<T extends QueryResultRow>(
  pool: Pool,
  queryText: string,
  values: unknown[],
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
    rowDescription?: string;
    accept?: (result: QueryResult<T>) => boolean;
  },
) {
  const timeoutMs = options?.timeoutMs ?? 60000;
  const intervalMs = options?.intervalMs ?? 3000;
  const deadline = Date.now() + timeoutMs;
  const accept = options?.accept ?? ((result: QueryResult<T>) => result.rows.length > 0);

  while (Date.now() < deadline) {
    const result = await pool.query<T>(queryText, values);
    if (accept(result)) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(options?.rowDescription || "Timed out waiting for database state");
}

export async function deleteS3ObjectIfPresent(input: {
  s3: S3Client;
  bucket: string;
  key?: string;
}) {
  if (!input.key) {
    return;
  }

  await input.s3.send(
    new DeleteObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
    }),
  );
}

export async function deleteFaceIfPresent(input: {
  rekognition: RekognitionClient;
  collectionId: string;
  faceId?: string;
}) {
  if (!input.faceId) {
    return;
  }

  await input.rekognition.send(
    new DeleteFacesCommand({
      CollectionId: input.collectionId,
      FaceIds: [input.faceId],
    }),
  );
}
