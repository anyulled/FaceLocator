import "server-only";

import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

import {
  createAdminEvent as createAdminEventDirect,
  deleteAdminEventPhoto as deleteAdminEventPhotoDirect,
  deleteAdminEventPhotosBatch as deleteAdminEventPhotosBatchDirect,
  getAdminEventHeader as getAdminEventHeaderDirect,
  listAdminEventPhotos as listAdminEventPhotosDirect,
  listAdminEvents as listAdminEventsDirect,
} from "@/lib/admin/events/repository";
import type {
  AdminEventPhotosPage,
  AdminEventSummary,
  BatchDeleteSummary,
  CreateEventInput,
  PhotoDeleteResult,
} from "@/lib/admin/events/contracts";

export const ADMIN_BACKEND_MODES = ["direct", "lambda"] as const;
export type AdminBackendMode = (typeof ADMIN_BACKEND_MODES)[number];

export type AdminEventPhotosView = AdminEventPhotosPage & {
  event: Awaited<ReturnType<typeof getAdminEventHeaderDirect>>;
};

type LambdaOperation =
  | "listAdminEvents"
  | "getAdminEventPhotosPage"
  | "createAdminEvent"
  | "deleteAdminEventPhoto"
  | "deleteAdminEventPhotosBatch";

type LambdaPayload<TInput> = {
  operation: LambdaOperation;
  input: TInput;
};

type LambdaResponseEnvelope<T> =
  | T
  | {
      statusCode?: number;
      body?: string;
      errorMessage?: string;
    };

function resolveBackendMode(value: string | undefined, envName: string): AdminBackendMode {
  const normalized = (value || "direct").trim().toLowerCase();
  if (normalized === "direct" || normalized === "lambda") {
    return normalized;
  }

  throw new Error(`${envName} must be either "direct" or "lambda"`);
}

function getAdminReadLambdaName() {
  const lambdaName = process.env.FACE_LOCATOR_ADMIN_READ_LAMBDA_NAME;
  if (!lambdaName) {
    throw new Error("FACE_LOCATOR_ADMIN_READ_LAMBDA_NAME is required when ADMIN_READ_BACKEND=lambda");
  }

  return lambdaName;
}

function getAdminWriteEventsLambdaName() {
  const lambdaName = process.env.FACE_LOCATOR_ADMIN_WRITE_EVENTS_LAMBDA_NAME;
  if (!lambdaName) {
    throw new Error(
      "FACE_LOCATOR_ADMIN_WRITE_EVENTS_LAMBDA_NAME is required when ADMIN_WRITE_BACKEND=lambda",
    );
  }

  return lambdaName;
}

function getAdminWritePhotosLambdaName() {
  const lambdaName = process.env.FACE_LOCATOR_ADMIN_WRITE_PHOTOS_LAMBDA_NAME;
  if (!lambdaName) {
    throw new Error(
      "FACE_LOCATOR_ADMIN_WRITE_PHOTOS_LAMBDA_NAME is required when ADMIN_WRITE_BACKEND=lambda",
    );
  }

  return lambdaName;
}

export const ADMIN_READ_BACKEND = resolveBackendMode(process.env.ADMIN_READ_BACKEND, "ADMIN_READ_BACKEND");
export const ADMIN_WRITE_BACKEND = resolveBackendMode(
  process.env.ADMIN_WRITE_BACKEND,
  "ADMIN_WRITE_BACKEND",
);

function getLambdaClient() {
  return new LambdaClient({
    region: process.env.AWS_REGION || "eu-west-1",
  });
}

function decodeLambdaPayload(payload: Uint8Array | undefined) {
  if (!payload) {
    return null;
  }

  return new TextDecoder().decode(payload);
}

async function invokeLambda<TResponse, TInput>(
  functionName: string,
  payload: LambdaPayload<TInput>,
): Promise<TResponse> {
  const client = getLambdaClient();
  const response = await client.send(
    new InvokeCommand({
      FunctionName: functionName,
      Payload: new TextEncoder().encode(JSON.stringify(payload)),
    }),
  );

  const rawPayload = decodeLambdaPayload(response.Payload);
  if (!rawPayload) {
    throw new Error(`Lambda ${functionName} returned no payload`);
  }

  const parsedPayload = JSON.parse(rawPayload) as LambdaResponseEnvelope<TResponse>;
  if (response.FunctionError) {
    if (
      typeof parsedPayload === "object" &&
      parsedPayload !== null &&
      "errorMessage" in parsedPayload &&
      typeof parsedPayload.errorMessage === "string"
    ) {
      throw new Error(parsedPayload.errorMessage);
    }

    throw new Error(`Lambda ${functionName} failed`);
  }

  if (
    typeof parsedPayload === "object" &&
    parsedPayload !== null &&
    "statusCode" in parsedPayload &&
    typeof parsedPayload.statusCode === "number" &&
    parsedPayload.statusCode >= 400
  ) {
    throw new Error(parsedPayload.errorMessage || `Lambda ${functionName} failed`);
  }

  if (
    typeof parsedPayload === "object" &&
    parsedPayload !== null &&
    "body" in parsedPayload &&
    typeof parsedPayload.body === "string"
  ) {
    return JSON.parse(parsedPayload.body) as TResponse;
  }

  return parsedPayload as TResponse;
}

export async function listAdminEvents(input: { page: number; pageSize: number }) {
  if (ADMIN_READ_BACKEND === "lambda") {
    return invokeLambda<Awaited<ReturnType<typeof listAdminEventsDirect>>, typeof input>(
      getAdminReadLambdaName(),
      {
        operation: "listAdminEvents",
        input,
      },
    );
  }

  return listAdminEventsDirect(input);
}

export async function getAdminEventPhotosPage(input: {
  eventSlug: string;
  page: number;
  pageSize: number;
}): Promise<AdminEventPhotosView> {
  if (ADMIN_READ_BACKEND === "lambda") {
    return invokeLambda<AdminEventPhotosView, typeof input>(getAdminReadLambdaName(), {
      operation: "getAdminEventPhotosPage",
      input,
    });
  }

  const [event, photosPage] = await Promise.all([
    getAdminEventHeaderDirect(input.eventSlug),
    listAdminEventPhotosDirect(input),
  ]);

  return {
    event,
    ...photosPage,
  };
}

export async function createAdminEvent(input: CreateEventInput): Promise<AdminEventSummary> {
  if (ADMIN_WRITE_BACKEND === "lambda") {
    return invokeLambda<AdminEventSummary, CreateEventInput>(getAdminWriteEventsLambdaName(), {
      operation: "createAdminEvent",
      input,
    });
  }

  return createAdminEventDirect(input);
}

export async function deleteAdminEventPhoto(input: {
  eventSlug: string;
  photoId: string;
  actorSub: string;
  requestId?: string;
}): Promise<PhotoDeleteResult> {
  if (ADMIN_WRITE_BACKEND === "lambda") {
    return invokeLambda<PhotoDeleteResult, typeof input>(getAdminWritePhotosLambdaName(), {
      operation: "deleteAdminEventPhoto",
      input,
    });
  }

  return deleteAdminEventPhotoDirect(input);
}

export async function deleteAdminEventPhotosBatch(input: {
  eventSlug: string;
  photoIds: string[];
  actorSub: string;
  idempotencyKey: string;
}): Promise<BatchDeleteSummary> {
  if (ADMIN_WRITE_BACKEND === "lambda") {
    return invokeLambda<BatchDeleteSummary, typeof input>(getAdminWritePhotosLambdaName(), {
      operation: "deleteAdminEventPhotosBatch",
      input,
    });
  }

  return deleteAdminEventPhotosBatchDirect(input);
}
