import type {
  RegistrationCompleteRequest,
  RegistrationIntentRequest,
  RegistrationIntentResponse,
  RegistrationStatusResponse,
} from "@/lib/attendees/contracts";
import { getAttendeeRepository, getUploadGateway } from "@/lib/attendees/runtime";

export async function createRegistrationIntentViaBackend(
  input: RegistrationIntentRequest,
): Promise<RegistrationIntentResponse> {
  return getAttendeeRepository().createRegistrationIntent(input, getUploadGateway());
}

export async function completeRegistrationViaBackend(
  input: RegistrationCompleteRequest,
): Promise<RegistrationStatusResponse> {
  return getAttendeeRepository().completeRegistration(
    input.registrationId,
    input.uploadCompletedAt,
  );
}

export async function getRegistrationStatusViaBackend(
  registrationId: string,
): Promise<RegistrationStatusResponse> {
  return getAttendeeRepository().getRegistrationStatus(registrationId);
}
