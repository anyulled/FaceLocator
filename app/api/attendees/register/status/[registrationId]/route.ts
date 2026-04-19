import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/attendees/errors";
import { inMemoryAttendeeRepository } from "@/lib/attendees/repository";

type RegistrationStatusRouteContext = {
  params: Promise<{
    registrationId: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RegistrationStatusRouteContext,
) {
  try {
    const { registrationId } = await context.params;
    const response = inMemoryAttendeeRepository.getRegistrationStatus(registrationId);
    return NextResponse.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}
