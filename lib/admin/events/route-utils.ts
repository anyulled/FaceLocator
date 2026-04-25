import { NextResponse } from "next/server";

import { AdminReadBackendError } from "@/lib/admin/events/backend";
import { describeDatabaseError, isDatabaseErrorLike } from "@/lib/aws/database-errors";

/**
 * Extract a request correlation ID from standard AWS/CDN headers.
 */
export function extractRequestId(headers: Headers): string | null {
  return (
    headers.get("x-amz-cf-id") ??
    headers.get("x-amzn-requestid") ??
    headers.get("x-correlation-id") ??
    null
  );
}

/**
 * Shared admin API route error handler.
 *
 * Classifies the error as a database error, backend (Lambda) error,
 * or generic error, logs it, and returns a structured NextResponse.
 */
export function buildAdminErrorResponse(input: {
  error: unknown;
  scope: string;
  requestPath: string;
  requestId: string | null;
  defaultMessage: string;
  defaultStatus: number;
  context?: Record<string, unknown>;
}): NextResponse {
  const { error, scope, requestPath, requestId, defaultMessage, defaultStatus, context } = input;

  const databaseError = isDatabaseErrorLike(error) ? describeDatabaseError(error) : null;
  const backendError = error instanceof AdminReadBackendError ? error : null;

  const message = databaseError?.message ?? backendError?.message ?? defaultMessage;
  const status = databaseError?.status ?? backendError?.statusCode ?? defaultStatus;

  console.error(
    JSON.stringify({
      scope,
      level: "error",
      message,
      requestPath,
      requestId,
      statusCode: status,
      database: databaseError,
      backend: backendError
        ? { message: backendError.message, statusCode: backendError.statusCode, details: backendError.details }
        : null,
      error: error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { message: String(error) },
      ...context,
    }),
  );

  return NextResponse.json({ error: message, requestId }, { status });
}
