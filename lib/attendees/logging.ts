import { headers } from "next/headers";
import { NextResponse } from "next/server";

import type { ApiErrorCode } from "@/lib/attendees/contracts";
import { AttendeeApiError, toApiErrorResponse } from "@/lib/attendees/errors";
import { describeDatabaseError, isDatabaseErrorLike } from "@/lib/aws/database-errors";

export const CORRELATION_HEADER = "x-correlation-id";

export type RouteLogContext = {
  correlationId: string;
  eventSlug?: string;
  registrationId?: string;
};

export async function getServerCorrelationId() {
  const requestHeaders = await headers();
  return requestHeaders.get(CORRELATION_HEADER) ?? crypto.randomUUID();
}

export function getRequestCorrelationId(request: Request) {
  return request.headers.get(CORRELATION_HEADER) ?? crypto.randomUUID();
}

export function logRouteInfo(
  message: string,
  context: RouteLogContext & Record<string, unknown>,
) {
  console.info(
    JSON.stringify({
      level: "info",
      message,
      ...context,
    }),
  );
}

export function logRouteError(
  error: unknown,
  context: RouteLogContext & Record<string, unknown>,
) {
  const code =
    error instanceof AttendeeApiError ? error.code : ("INTERNAL_ERROR" satisfies ApiErrorCode);
  const databaseError = isDatabaseErrorLike(error) ? describeDatabaseError(error) : null;

  console.error(
    JSON.stringify({
      level: "error",
      code,
      message: error instanceof Error ? error.message : "Unknown error",
      database: databaseError,
      ...context,
    }),
  );
}

export function jsonWithCorrelationId<T>(
  payload: T,
  correlationId: string,
  init?: ResponseInit,
) {
  const response = NextResponse.json(payload, init);
  response.headers.set(CORRELATION_HEADER, correlationId);
  return response;
}

export function errorResponseWithCorrelationId(
  error: unknown,
  correlationId: string,
) {
  const status = error instanceof AttendeeApiError
    ? error.status
    : isDatabaseErrorLike(error)
      ? describeDatabaseError(error).status
      : 500;
  const response = NextResponse.json(toApiErrorResponse(error, correlationId), { status });
  response.headers.set(CORRELATION_HEADER, correlationId);
  return response;
}
