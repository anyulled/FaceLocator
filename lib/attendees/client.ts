import type {
  ApiErrorResponse,
  RegistrationCompleteRequest,
  RegistrationIntentRequest,
  RegistrationIntentResponse,
  RegistrationStatusResponse,
  UploadInstructions,
} from "@/lib/attendees/contracts";

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | ApiErrorResponse;

  if (!response.ok) {
    throw payload;
  }

  return payload as T;
}

export async function createRegistrationIntent(input: RegistrationIntentRequest) {
  const response = await fetch("/api/attendees/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJsonResponse<RegistrationIntentResponse>(response);
}

export async function uploadSelfie(upload: UploadInstructions, file: File) {
  if (upload.url.startsWith("mock://")) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return;
  }

  const response = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: file,
  });

  if (!response.ok) {
    throw {
      error: {
        code: "INTERNAL_ERROR",
        message: "Selfie upload failed.",
      },
    } satisfies ApiErrorResponse;
  }
}

export async function completeRegistration(input: RegistrationCompleteRequest) {
  const response = await fetch("/api/attendees/register/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJsonResponse<RegistrationStatusResponse>(response);
}

export async function getRegistrationStatus(registrationId: string) {
  const response = await fetch(`/api/attendees/register/status/${registrationId}`, {
    method: "GET",
  });

  return parseJsonResponse<RegistrationStatusResponse>(response);
}
