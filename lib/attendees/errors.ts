import type {
  ApiErrorCode,
  ApiErrorField,
  ApiErrorResponse,
} from "@/lib/attendees/contracts";
import { describeDatabaseError, isDatabaseErrorLike } from "@/lib/aws/database-errors";

export class AttendeeApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly field?: ApiErrorField,
  ) {
    super(message);
    this.name = "AttendeeApiError";
  }
}

export function createApiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  field?: ApiErrorField,
) {
  return new AttendeeApiError(status, code, message, field);
}

export function toApiErrorResponse(
  error: unknown,
  correlationId?: string,
): ApiErrorResponse {
  if (error instanceof AttendeeApiError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        field: error.field,
        correlationId,
      },
    };
  }

  if (isDatabaseErrorLike(error)) {
    return {
      error: {
        code: "INTERNAL_ERROR",
        message: describeDatabaseError(error).message,
        correlationId,
      },
    };
  }

  return {
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong while processing the enrollment request.",
      correlationId,
    },
  };
}

export function errorResponse(error: unknown) {
  if (isDatabaseErrorLike(error)) {
    const databaseError = describeDatabaseError(error);
    return Response.json(toApiErrorResponse(error), {
      status: databaseError.status,
    });
  }

  return Response.json(toApiErrorResponse(error), {
    status: error instanceof AttendeeApiError ? error.status : 500,
  });
}
