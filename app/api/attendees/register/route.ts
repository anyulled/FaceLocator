import { createApiError } from "@/lib/attendees/errors";
import {
  errorResponseWithCorrelationId,
  getRequestCorrelationId,
  jsonWithCorrelationId,
  logRouteError,
  logRouteInfo,
} from "@/lib/attendees/logging";
import { evaluateRegistrationRateLimit } from "@/lib/attendees/rate-limit";
import { getAttendeeRepository, getUploadGateway } from "@/lib/attendees/runtime";
import { validateRegistrationIntentRequest } from "@/lib/attendees/schemas";
import { getEventBySlug } from "@/lib/events/queries";

export async function POST(request: Request) {
  const correlationId = getRequestCorrelationId(request);

  try {
    const requestBody = await request.json().catch(() => {
      throw createApiError(
        400,
        "INTERNAL_ERROR",
        "Request body must be a JSON object.",
      );
    });
    const payload = validateRegistrationIntentRequest(requestBody);
    const rateLimitDecision = evaluateRegistrationRateLimit(request, payload);

    if (!rateLimitDecision.allowed) {
      throw createApiError(
        429,
        "RATE_LIMITED",
        "Too many enrollment attempts. Please try again shortly.",
      );
    }

    const event = await getEventBySlug(payload.eventSlug);

    if (!event) {
      throw createApiError(
        404,
        "INVALID_EVENT",
        "This event registration page is not available.",
      );
    }

    logRouteInfo("registration_intent_received", {
      correlationId,
      eventSlug: payload.eventSlug,
    });

    const response = await getAttendeeRepository().createRegistrationIntent(
      payload,
      getUploadGateway(),
    );

    logRouteInfo("registration_intent_created", {
      correlationId,
      eventSlug: payload.eventSlug,
      registrationId: response.registrationId,
    });

    return jsonWithCorrelationId(response, correlationId);
  } catch (error) {
    logRouteError(error, { correlationId });
    return errorResponseWithCorrelationId(error, correlationId);
  }
}
