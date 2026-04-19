import type {
  EnrollmentStatus,
  RegistrationIntentRequest,
  RegistrationIntentResponse,
  RegistrationStatusResponse,
} from "@/lib/attendees/contracts";
import { createApiError } from "@/lib/attendees/errors";
import type { UploadGateway } from "@/lib/attendees/upload-gateway";

type RegistrationRecord = {
  registrationId: string;
  attendeeId: string;
  eventSlug: string;
  name: string;
  email: string;
  submissionKey?: string;
  status: EnrollmentStatus;
  uploadCompletedAt?: string;
  lastUpdatedAt: string;
  response: RegistrationIntentResponse;
};

type Store = {
  attendeesByEventEmail: Map<string, string>;
  registrations: Map<string, RegistrationRecord>;
  submissionKeyToRegistrationId: Map<string, string>;
};

declare global {
  var __faceLocatorEnrollmentStore__: Store | undefined;
}

function createStore(): Store {
  return {
    attendeesByEventEmail: new Map(),
    registrations: new Map(),
    submissionKeyToRegistrationId: new Map(),
  };
}

function getStore() {
  globalThis.__faceLocatorEnrollmentStore__ ??= createStore();
  return globalThis.__faceLocatorEnrollmentStore__;
}

function makeId(prefix: "reg" | "att") {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function resolveStatusMessage(status: EnrollmentStatus) {
  switch (status) {
    case "UPLOAD_PENDING":
      return "Your registration is ready for selfie upload.";
    case "UPLOADING":
      return "Your selfie upload is in progress.";
    case "PROCESSING":
      return "Your selfie is being processed now.";
    case "ENROLLED":
      return "Your selfie has been registered.";
    case "FAILED":
      return "We could not finish your enrollment.";
    case "CANCELLED":
      return "This enrollment was cancelled.";
  }
}

export type AttendeeRepository = {
  createRegistrationIntent(
    input: RegistrationIntentRequest,
    gateway: UploadGateway,
  ): RegistrationIntentResponse;
  completeRegistration(
    registrationId: string,
    uploadCompletedAt: string,
  ): RegistrationStatusResponse;
  getRegistrationStatus(registrationId: string): RegistrationStatusResponse;
};

export const inMemoryAttendeeRepository: AttendeeRepository = {
  createRegistrationIntent(input, gateway) {
    const store = getStore();

    if (input.submissionKey) {
      const existingId = store.submissionKeyToRegistrationId.get(input.submissionKey);
      const existing = existingId ? store.registrations.get(existingId) : undefined;

      if (existing) {
        return existing.response;
      }
    }

    const attendeeKey = `${input.eventSlug}:${input.email}`;
    const attendeeId = store.attendeesByEventEmail.get(attendeeKey) ?? makeId("att");
    store.attendeesByEventEmail.set(attendeeKey, attendeeId);

    const registrationId = makeId("reg");
    const upload = gateway.createUploadInstructions({
      registrationId,
      attendeeId,
      eventSlug: input.eventSlug,
      fileName: input.fileName,
      contentType: input.contentType,
    });

    const response: RegistrationIntentResponse = {
      registrationId,
      attendeeId,
      upload,
      status: "UPLOAD_PENDING",
    };

    const record: RegistrationRecord = {
      registrationId,
      attendeeId,
      eventSlug: input.eventSlug,
      name: input.name,
      email: input.email,
      submissionKey: input.submissionKey,
      status: "UPLOAD_PENDING",
      lastUpdatedAt: new Date().toISOString(),
      response,
    };

    store.registrations.set(registrationId, record);

    if (input.submissionKey) {
      store.submissionKeyToRegistrationId.set(input.submissionKey, registrationId);
    }

    return response;
  },

  completeRegistration(registrationId, uploadCompletedAt) {
    const store = getStore();
    const record = store.registrations.get(registrationId);

    if (!record) {
      throw createApiError(404, "REGISTRATION_NOT_FOUND", "Registration not found.");
    }

    record.status = "PROCESSING";
    record.uploadCompletedAt = uploadCompletedAt;
    record.lastUpdatedAt = new Date().toISOString();

    return {
      registrationId,
      status: "PROCESSING",
      message: resolveStatusMessage("PROCESSING"),
    };
  },

  getRegistrationStatus(registrationId) {
    const store = getStore();
    const record = store.registrations.get(registrationId);

    if (!record) {
      throw createApiError(404, "REGISTRATION_NOT_FOUND", "Registration not found.");
    }

    if (record.status === "PROCESSING" && record.uploadCompletedAt) {
      const elapsed = Date.now() - Date.parse(record.uploadCompletedAt);
      if (elapsed >= 1200) {
        record.status = "ENROLLED";
      }
    }

    return {
      registrationId,
      status: record.status,
      message: resolveStatusMessage(record.status),
    };
  },
};
