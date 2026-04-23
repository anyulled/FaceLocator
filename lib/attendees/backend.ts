import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

import type {
  ApiErrorField,
  RegistrationCompleteRequest,
  RegistrationIntentRequest,
  RegistrationIntentResponse,
  RegistrationStatusResponse,
} from "@/lib/attendees/contracts";
import { createApiError } from "@/lib/attendees/errors";

type PublicRegistrationBackendMode = "direct" | "lambda";

let lambdaClient: LambdaClient | null = null;

const DEFAULT_ATTENDEE_REGISTRATION_LAMBDA_NAME = "face-locator-poc-attendee-registration";

function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

export function getPublicRegistrationBackendMode(): PublicRegistrationBackendMode {
  const mode = readEnv(
    "PUBLIC_REGISTRATION_BACKEND",
    "FACE_LOCATOR_PUBLIC_REGISTRATION_BACKEND",
    "ATTENDEE_REGISTRATION_BACKEND",
  );
  if (mode === "direct") {
    return "direct";
  }

  if (mode === "lambda" || process.env.FACE_LOCATOR_REPOSITORY_TYPE === "postgres") {
    return "lambda";
  }

  return "direct";
}

export function getAttendeeRegistrationLambdaName() {
  return (
    readEnv(
      "FACE_LOCATOR_ATTENDEE_REGISTRATION_LAMBDA_NAME",
      "ATTENDEE_REGISTRATION_LAMBDA_NAME",
    ) || DEFAULT_ATTENDEE_REGISTRATION_LAMBDA_NAME
  );
}

function getLambdaClient() {
  if (!lambdaClient) {
    lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || "eu-west-1" });
  }

  return lambdaClient;
}

async function invokeAttendeeRegistrationLambda<T>(
  operation: string,
  input: unknown,
): Promise<T> {
  const lambdaName = getAttendeeRegistrationLambdaName();
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

  const payloadText = response.Payload ? Buffer.from(response.Payload).toString("utf8") : "";
  const payload = payloadText ? JSON.parse(payloadText) : null;

  if (!payload) {
    throw createApiError(
      502,
      "INTERNAL_ERROR",
      "Registration backend returned an empty response.",
    );
  }

  if (typeof payload === "object" && payload !== null && "statusCode" in payload) {
    const error = (payload as {
      statusCode?: unknown;
      error?: {
        code?: unknown;
        message?: unknown;
        field?: unknown;
      };
    }).error;
    const statusCode = Number((payload as { statusCode?: unknown }).statusCode) || 500;
    const code = error?.code === "INVALID_EVENT" || error?.code === "REGISTRATION_NOT_FOUND"
      ? error.code
      : "INTERNAL_ERROR";
    const message = typeof error?.message === "string"
      ? error.message
      : "Registration backend failed.";
    const field = typeof error?.field === "string" ? error.field as ApiErrorField : undefined;
    throw createApiError(statusCode, code, message, field);
  }

  return payload as T;
}

export async function getPublicEventBySlugViaBackend(slug: string) {
  return invokeAttendeeRegistrationLambda<{
    event: {
      slug: string;
      title: string;
      venue: string;
      scheduledAt: string;
      endsAt?: string;
      description: string;
      logoUrl?: string;
    } | null;
  }>("getEventBySlug", { slug });
}

export async function createRegistrationIntentViaBackend(
  input: RegistrationIntentRequest,
): Promise<RegistrationIntentResponse> {
  return invokeAttendeeRegistrationLambda("createRegistrationIntent", input);
}

export async function completeRegistrationViaBackend(
  input: RegistrationCompleteRequest,
): Promise<RegistrationStatusResponse> {
  return invokeAttendeeRegistrationLambda("completeRegistration", input);
}

export async function getRegistrationStatusViaBackend(
  registrationId: string,
): Promise<RegistrationStatusResponse> {
  return invokeAttendeeRegistrationLambda("getRegistrationStatus", { registrationId });
}
