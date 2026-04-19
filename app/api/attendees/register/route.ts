import { NextResponse } from "next/server";

import { createApiError, errorResponse } from "@/lib/attendees/errors";
import { inMemoryAttendeeRepository } from "@/lib/attendees/repository";
import { validateRegistrationIntentRequest } from "@/lib/attendees/schemas";
import { mockUploadGateway } from "@/lib/attendees/upload-gateway";
import { getEventBySlug } from "@/lib/events/queries";

export async function POST(request: Request) {
  try {
    const payload = validateRegistrationIntentRequest(await request.json());
    const event = await getEventBySlug(payload.eventSlug);

    if (!event) {
      throw createApiError(
        404,
        "INVALID_EVENT",
        "This event registration page is not available.",
      );
    }

    const response = inMemoryAttendeeRepository.createRegistrationIntent(
      payload,
      mockUploadGateway,
    );

    return NextResponse.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}
