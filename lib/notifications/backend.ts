import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

import {
  getMatchedGalleryData,
  unsubscribeFromMatchedPhotoNotifications,
} from "@/lib/notifications/gallery";
import { verifySignedNotificationToken } from "@/lib/notifications/token";

type MatchedPhotoBackendMode = "direct" | "lambda";

type GalleryData = {
  attendeeName: string;
  photoUrls: string[];
};

type UnsubscribeResult = {
  unsubscribed?: boolean;
};

const DEFAULT_MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME =
  "face-locator-poc-matched-photo-notifier";

let lambdaClient: LambdaClient | null = null;

function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function getLambdaClient() {
  if (!lambdaClient) {
    lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || "eu-west-1" });
  }

  return lambdaClient;
}

function isGalleryData(value: unknown): value is GalleryData {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.attendeeName === "string" &&
    Array.isArray(candidate.photoUrls) &&
    candidate.photoUrls.every((photoUrl) => typeof photoUrl === "string")
  );
}

function isUnsubscribeResult(value: unknown): value is UnsubscribeResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return candidate.unsubscribed === undefined || typeof candidate.unsubscribed === "boolean";
}

function logMatchedPhotoLambdaIssue(input: {
  operation: string;
  lambdaName: string;
  requestId: string | null;
  input: unknown;
  reason: string;
  functionError?: string | null;
  payload?: unknown;
}) {
  console.error(
    JSON.stringify({
      scope: "notifications",
      level: "error",
      operation: input.operation,
      backend: "lambda",
      lambdaName: input.lambdaName,
      requestId: input.requestId,
      input: input.input,
      reason: input.reason,
      functionError: input.functionError ?? null,
      payload: input.payload,
      troubleshootingHint:
        "Check the matched-photo-notifier Lambda logs, response shape, and Lambda invoke permissions.",
    }),
  );
}

export function getMatchedPhotoBackendMode(): MatchedPhotoBackendMode {
  const mode = readEnv("MATCH_LINK_BACKEND", "FACE_LOCATOR_MATCH_LINK_BACKEND");
  if (mode === "direct") {
    return "direct";
  }

  if (
    mode === "lambda" ||
    process.env.FACE_LOCATOR_REPOSITORY_TYPE === "postgres" ||
    process.env.NODE_ENV === "production"
  ) {
    return "lambda";
  }

  return "direct";
}

export function getMatchedPhotoNotifierLambdaName() {
  return (
    readEnv(
      "FACE_LOCATOR_MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME",
      "MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME",
    ) || DEFAULT_MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME
  );
}

async function invokeMatchedPhotoNotifierLambda<T>(
  operation: string,
  input: unknown,
  validatePayload: (payload: unknown) => payload is T,
): Promise<T | null> {
  const lambdaName = getMatchedPhotoNotifierLambdaName();

  try {
    const response = await getLambdaClient().send(
      new InvokeCommand({
        FunctionName: lambdaName,
        InvocationType: "RequestResponse",
        Payload: Buffer.from(
          JSON.stringify({
            operation,
            input,
          }),
        ),
      }),
    );

    const requestId = response.$metadata?.requestId ?? null;
    if (response.FunctionError) {
      logMatchedPhotoLambdaIssue({
        operation,
        lambdaName,
        requestId,
        input,
        reason: "Lambda returned an error response.",
        functionError: response.FunctionError,
      });
      return null;
    }

    const payloadText = response.Payload ? Buffer.from(response.Payload).toString("utf8") : "";
    const payload = payloadText ? JSON.parse(payloadText) : null;

    if (!payload) {
      logMatchedPhotoLambdaIssue({
        operation,
        lambdaName,
        requestId,
        input,
        reason: "Lambda returned an empty payload.",
      });
      return null;
    }

    if (!validatePayload(payload)) {
      logMatchedPhotoLambdaIssue({
        operation,
        lambdaName,
        requestId,
        input,
        reason: "Lambda returned an unexpected payload shape.",
        payload,
      });
      return null;
    }

    return payload;
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "notifications",
        level: "error",
        operation,
        backend: "lambda",
        lambdaName,
        input,
        troubleshootingHint:
          "Check Lambda invoke permission, the matched-photo-notifier function name, and CloudWatch logs.",
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
      }),
    );
    return null;
  }
}

export async function getMatchedGalleryDataViaBackend(input: {
  eventId: string;
  faceId: string;
  token: string;
}): Promise<GalleryData | null> {
  if (getMatchedPhotoBackendMode() === "lambda") {
    return invokeMatchedPhotoNotifierLambda<GalleryData>("getGalleryPageData", input, isGalleryData);
  }

  try {
    const tokenPayload = verifySignedNotificationToken(input.token, "gallery");
    if (!tokenPayload || tokenPayload.eventId !== input.eventId || tokenPayload.faceId !== input.faceId) {
      return null;
    }

    return await getMatchedGalleryData({
      eventId: input.eventId,
      attendeeId: tokenPayload.sub,
      faceId: input.faceId,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "notifications",
        level: "error",
        operation: "getGalleryPageData",
        backend: "direct",
        input,
        troubleshootingHint:
          "Check the notification signing secret, database access, and gallery query contract.",
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
      }),
    );
    return null;
  }
}

export async function unsubscribeFromMatchedPhotoNotificationsViaBackend(input: {
  eventId: string;
  faceId: string;
  token: string;
}): Promise<boolean> {
  if (getMatchedPhotoBackendMode() === "lambda") {
    const payload = await invokeMatchedPhotoNotifierLambda<UnsubscribeResult>(
      "unsubscribeFromMatchedPhotos",
      input,
      isUnsubscribeResult,
    );

    return Boolean(payload?.unsubscribed);
  }

  try {
    const tokenPayload = verifySignedNotificationToken(input.token, "unsubscribe");
    if (!tokenPayload || tokenPayload.eventId !== input.eventId || tokenPayload.faceId !== input.faceId) {
      return false;
    }

    await unsubscribeFromMatchedPhotoNotifications({
      eventId: tokenPayload.eventId,
      attendeeId: tokenPayload.sub,
    });

    return true;
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "notifications",
        level: "error",
        operation: "unsubscribeFromMatchedPhotos",
        backend: "direct",
        input,
        troubleshootingHint:
          "Check the notification signing secret and database access for the unsubscribe flow.",
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
      }),
    );
    return false;
  }
}
