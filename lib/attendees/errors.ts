import { NextResponse } from "next/server";

import type { ApiErrorCode, ApiErrorResponse } from "@/lib/attendees/contracts";

export class AttendeeApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly field?: ApiErrorResponse["error"]["field"],
  ) {
    super(message);
    this.name = "AttendeeApiError";
  }
}

export function createApiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  field?: ApiErrorResponse["error"]["field"],
) {
  return new AttendeeApiError(status, code, message, field);
}

export function toApiErrorResponse(error: unknown): ApiErrorResponse {
  if (error instanceof AttendeeApiError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        field: error.field,
      },
    };
  }

  return {
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong while processing the enrollment request.",
    },
  };
}

export function errorResponse(error: unknown) {
  const status = error instanceof AttendeeApiError ? error.status : 500;
  return NextResponse.json(toApiErrorResponse(error), { status });
}
