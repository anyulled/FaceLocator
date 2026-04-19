import { NextResponse } from "next/server";

import { createApiError, errorResponse } from "@/lib/attendees/errors";
import { inMemoryAttendeeRepository } from "@/lib/attendees/repository";
import { validateRegistrationCompleteRequest } from "@/lib/attendees/schemas";

export async function POST(request: Request) {
  try {
    const requestBody = await request.json().catch(() => {
      throw new Error("INVALID_JSON");
    });
    const payload = validateRegistrationCompleteRequest(requestBody);
    const response = inMemoryAttendeeRepository.completeRegistration(
      payload.registrationId,
      payload.uploadCompletedAt,
    );

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return errorResponse(
        createApiError(400, "INTERNAL_ERROR", "Request body must be a JSON object."),
      );
    }
    return errorResponse(error);
  }
}
