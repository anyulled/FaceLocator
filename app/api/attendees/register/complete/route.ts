import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/attendees/errors";
import { inMemoryAttendeeRepository } from "@/lib/attendees/repository";
import { validateRegistrationCompleteRequest } from "@/lib/attendees/schemas";

export async function POST(request: Request) {
  try {
    const payload = validateRegistrationCompleteRequest(await request.json());
    const response = inMemoryAttendeeRepository.completeRegistration(
      payload.registrationId,
      payload.uploadCompletedAt,
    );

    return NextResponse.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}
