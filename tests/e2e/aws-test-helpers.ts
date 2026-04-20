import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DeleteFacesCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
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
