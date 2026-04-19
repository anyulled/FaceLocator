import {
  errorResponseWithCorrelationId,
  getRequestCorrelationId,
  jsonWithCorrelationId,
  logRouteError,
  logRouteInfo,
} from "@/lib/attendees/logging";
import { getAttendeeRepository } from "@/lib/attendees/runtime";

type RegistrationStatusRouteContext = {
  params: Promise<{
    registrationId: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RegistrationStatusRouteContext,
) {
  const correlationId = getRequestCorrelationId(_request);

  try {
    const { registrationId } = await context.params;
    const response = getAttendeeRepository().getRegistrationStatus(registrationId);
    logRouteInfo("registration_status_read", {
      correlationId,
      registrationId,
      eventSlug: undefined,
    });
    return jsonWithCorrelationId(response, correlationId);
  } catch (error) {
    logRouteError(error, { correlationId });
    return errorResponseWithCorrelationId(error, correlationId);
  }
}
