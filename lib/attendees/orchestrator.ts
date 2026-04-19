import type {
  RegistrationCompleteRequest,
  RegistrationIntentRequest,
  RegistrationStatusResponse,
} from "@/lib/attendees/contracts";

export const REGISTRATION_STATUS_POLL_INTERVAL_MS = 1200;

export type EnrollmentClientDependencies = {
  completeRegistration: (input: RegistrationCompleteRequest) => Promise<RegistrationStatusResponse>;
  createRegistrationIntent: (input: RegistrationIntentRequest) => Promise<{
    registrationId: string;
    attendeeId: string;
    upload: {
      method: "PUT";
      url: string;
      headers: Record<string, string>;
      objectKey: string;
      expiresAt: string;
    };
    status: "UPLOAD_PENDING";
  }>;
  getRegistrationStatus: (registrationId: string) => Promise<RegistrationStatusResponse>;
  uploadSelfie: (
    upload: {
      method: "PUT";
      url: string;
      headers: Record<string, string>;
      objectKey: string;
      expiresAt: string;
    },
    file: File,
  ) => Promise<void>;
};

export async function pollRegistrationStatus(
  getRegistrationStatus: EnrollmentClientDependencies["getRegistrationStatus"],
  registrationId: string,
  onStatus: (status: RegistrationStatusResponse) => void,
) {
  let currentStatus = await getRegistrationStatus(registrationId);
  onStatus(currentStatus);

  while (
    currentStatus.status !== "ENROLLED" &&
    currentStatus.status !== "FAILED" &&
    currentStatus.status !== "CANCELLED"
  ) {
    await new Promise((resolve) =>
      setTimeout(resolve, REGISTRATION_STATUS_POLL_INTERVAL_MS),
    );
    currentStatus = await getRegistrationStatus(registrationId);
    onStatus(currentStatus);
  }

  return currentStatus;
}
