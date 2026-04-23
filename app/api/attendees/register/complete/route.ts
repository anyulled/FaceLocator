import { createApiError } from "@/lib/attendees/errors";
import {
  completeRegistrationViaBackend,
  getPublicRegistrationBackendMode,
} from "@/lib/attendees/backend";
import {
  errorResponseWithCorrelationId,
  getRequestCorrelationId,
  jsonWithCorrelationId,
  logRouteError,
  logRouteInfo,
} from "@/lib/attendees/logging";
import { getAttendeeRepository } from "@/lib/attendees/runtime";
import { validateRegistrationCompleteRequest } from "@/lib/attendees/schemas";

export async function POST(request: Request) {
  const correlationId = getRequestCorrelationId(request);

  try {
    const requestBody = await request.json().catch(() => {
      throw new Error("INVALID_JSON");
    });
    const payload = validateRegistrationCompleteRequest(requestBody);
    const response = getPublicRegistrationBackendMode() === "lambda"
      ? await completeRegistrationViaBackend(payload)
      : await getAttendeeRepository().completeRegistration(
        payload.registrationId,
        payload.uploadCompletedAt,
      );

    logRouteInfo("registration_upload_completed", {
      correlationId,
      registrationId: payload.registrationId,
    });

    return jsonWithCorrelationId(response, correlationId);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return errorResponseWithCorrelationId(
        createApiError(400, "INTERNAL_ERROR", "Request body must be a JSON object."),
        correlationId,
      );
    }
    logRouteError(error, { correlationId });
    return errorResponseWithCorrelationId(error, correlationId);
  }
}
