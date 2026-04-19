"use client";

import Image from "next/image";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { AttendeeEnrollmentStatus } from "@/components/events/attendee-enrollment-status";
import {
  completeRegistration,
  createRegistrationIntent,
  getRegistrationStatus,
  uploadSelfie,
} from "@/lib/attendees/client";
import type {
  ApiErrorResponse,
  EnrollmentEventSummary,
} from "@/lib/attendees/contracts";
import { mapApiErrorToFieldErrors } from "@/lib/attendees/mapper";
import {
  enrollmentInitialState,
  transitionEnrollmentState,
} from "@/lib/attendees/state-machine";
import { validateRegistrationIntentRequest } from "@/lib/attendees/schemas";
import { trackEnrollmentEvent } from "@/lib/attendees/telemetry";

type FieldErrors = Partial<
  Record<"name" | "email" | "consentAccepted" | "selfie", string>
>;

type AttendeeEnrollmentFormProps = {
  event: EnrollmentEventSummary;
};

const POLL_INTERVAL_MS = 1200;

export function AttendeeEnrollmentForm({
  event,
}: AttendeeEnrollmentFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submissionKey, setSubmissionKey] = useState<string | null>(null);
  const [machine, setMachine] = useState(enrollmentInitialState);
  const [statusMessage, setStatusMessage] = useState(
    "Complete the form and upload a recent selfie to begin enrollment.",
  );
  const [registrationId, setRegistrationId] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    trackEnrollmentEvent("enrollment_form_viewed", { eventSlug: event.slug });
  }, [event.slug]);

  const previewUrl = useMemo(() => {
    return selectedFile ? URL.createObjectURL(selectedFile) : null;
  }, [selectedFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const isWorking = useMemo(() => {
    return !["IDLE", "FAILED", "ENROLLED"].includes(machine.value);
  }, [machine.value]);

  async function pollUntilSettled(currentRegistrationId: string) {
    let isPolling = true;

    while (isPolling) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const status = await getRegistrationStatus(currentRegistrationId);

      if (status.status === "ENROLLED") {
        setMachine({ value: "ENROLLED" });
        setStatusMessage(status.message);
        trackEnrollmentEvent("enrollment_completed", { eventSlug: event.slug });
        isPolling = false;
        return;
      }

      if (status.status === "FAILED" || status.status === "CANCELLED") {
        setMachine({ value: "FAILED" });
        setStatusMessage(status.message);
        trackEnrollmentEvent("enrollment_failed", { eventSlug: event.slug });
        isPolling = false;
        return;
      }

      setMachine({ value: "PROCESSING" });
      setStatusMessage(status.message);
    }
  }

  async function handleSubmit(formDataEvent: FormEvent<HTMLFormElement>) {
    formDataEvent.preventDefault();

    setFieldErrors({});
    setMachine(transitionEnrollmentState(enrollmentInitialState, { type: "VALIDATE" }));

    const nextSubmissionKey = submissionKey ?? crypto.randomUUID();
    setSubmissionKey(nextSubmissionKey);

    try {
      const payload = validateRegistrationIntentRequest({
        eventSlug: event.slug,
        name,
        email,
        contentType: selectedFile?.type ?? "",
        fileName: selectedFile?.name ?? "",
        fileSizeBytes: selectedFile?.size ?? 0,
        consentAccepted,
        submissionKey: nextSubmissionKey,
      });

      trackEnrollmentEvent("enrollment_submit_clicked", { eventSlug: event.slug });

      setMachine({ value: "CREATING_REGISTRATION" });
      setStatusMessage("Creating your registration and reserving the upload slot.");

      const registration = await createRegistrationIntent(payload);
      setRegistrationId(registration.registrationId);
      setMachine(
        transitionEnrollmentState(
          { value: "CREATING_REGISTRATION" },
          { type: "REGISTRATION_CREATED" },
        ),
      );
      setStatusMessage("Registration created. Uploading your selfie now.");
      trackEnrollmentEvent("enrollment_registration_created", { eventSlug: event.slug });

      if (!selectedFile) {
        throw {
          error: {
            code: "MISSING_FILE",
            message: "Please select a selfie to upload.",
            field: "selfie",
          },
        } satisfies ApiErrorResponse;
      }

      setMachine(
        transitionEnrollmentState({ value: "READY_TO_UPLOAD" }, { type: "UPLOAD_STARTED" }),
      );
      trackEnrollmentEvent("enrollment_upload_started", { eventSlug: event.slug });

      await uploadSelfie(registration.upload, selectedFile);
      setMachine(
        transitionEnrollmentState({ value: "UPLOADING" }, { type: "UPLOAD_FINISHED" }),
      );
      setStatusMessage("Upload complete. Confirming registration with the server.");
      trackEnrollmentEvent("enrollment_upload_succeeded", { eventSlug: event.slug });

      const status = await completeRegistration({
        registrationId: registration.registrationId,
        uploadCompletedAt: new Date().toISOString(),
      });

      setMachine(
        transitionEnrollmentState({ value: "UPLOAD_CONFIRMED" }, { type: "STATUS_PENDING" }),
      );
      setStatusMessage(status.message);
      trackEnrollmentEvent("enrollment_processing_seen", { eventSlug: event.slug });

      await pollUntilSettled(registration.registrationId);
    } catch (error) {
      const apiError = error as ApiErrorResponse;
      const mappedErrors = apiError.error ? mapApiErrorToFieldErrors(apiError.error) : {};
      setFieldErrors(mappedErrors);
      setMachine({ value: "FAILED" });
      setStatusMessage(
        apiError.error?.message ??
          "We hit an unexpected problem while processing your enrollment.",
      );
      trackEnrollmentEvent("enrollment_failed", { eventSlug: event.slug });
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "grid",
        gap: "1rem",
      }}
    >
      <div style={{ display: "grid", gap: "0.45rem" }}>
        <label htmlFor="name" style={{ fontWeight: 600 }}>
          Full name
        </label>
        <input
          id="name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Jane Doe"
          style={inputStyles}
        />
        {fieldErrors.name ? <p style={errorStyles}>{fieldErrors.name}</p> : null}
      </div>

      <div style={{ display: "grid", gap: "0.45rem" }}>
        <label htmlFor="email" style={{ fontWeight: 600 }}>
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="jane@example.com"
          style={inputStyles}
        />
        {fieldErrors.email ? <p style={errorStyles}>{fieldErrors.email}</p> : null}
      </div>

      <div style={{ display: "grid", gap: "0.45rem" }}>
        <label htmlFor="selfie" style={{ fontWeight: 600 }}>
          Selfie upload
        </label>
        <input
          id="selfie"
          name="selfie"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(changeEvent) => {
            const file = changeEvent.target.files?.[0] ?? null;
            setSelectedFile(file);
            if (file) {
              trackEnrollmentEvent("enrollment_file_selected", { eventSlug: event.slug });
            }
          }}
          style={inputStyles}
        />
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt="Selected selfie preview"
            unoptimized
            width={240}
            height={240}
            style={{
              width: "100%",
              maxWidth: "15rem",
              aspectRatio: "1 / 1",
              objectFit: "cover",
              borderRadius: "1rem",
              border: "1px solid var(--border)",
            }}
          />
        ) : (
          <p style={{ color: "var(--muted)", fontSize: "0.95rem" }}>
            Choose a recent selfie with a clear view of your face.
          </p>
        )}
        {fieldErrors.selfie ? <p style={errorStyles}>{fieldErrors.selfie}</p> : null}
      </div>

      <label
        htmlFor="consentAccepted"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.75rem",
          padding: "1rem",
          borderRadius: "1rem",
          border: "1px solid var(--border)",
          background: "rgba(255, 255, 255, 0.74)",
        }}
      >
        <input
          id="consentAccepted"
          name="consentAccepted"
          type="checkbox"
          checked={consentAccepted}
          onChange={(event) => setConsentAccepted(event.target.checked)}
          style={{ marginTop: "0.2rem" }}
        />
        <span style={{ lineHeight: 1.6 }}>
          I consent to FaceLocator using this selfie to match event photos for
          Speaker Session 2026.
        </span>
      </label>
      {fieldErrors.consentAccepted ? (
        <p style={errorStyles}>{fieldErrors.consentAccepted}</p>
      ) : null}

      <button
        type="submit"
        disabled={isWorking}
        style={{
          border: "none",
          borderRadius: "999px",
          padding: "1rem 1.35rem",
          background: isWorking ? "#d1c6bb" : "var(--accent)",
          color: isWorking ? "#5f574d" : "#fffaf5",
          fontWeight: 700,
          cursor: isWorking ? "progress" : "pointer",
        }}
      >
        {isWorking ? "Processing enrollment..." : "Register my selfie"}
      </button>

      <AttendeeEnrollmentStatus
        state={machine.value}
        message={statusMessage}
        registrationId={registrationId}
      />
    </form>
  );
}

const inputStyles: CSSProperties = {
  width: "100%",
  borderRadius: "0.9rem",
  border: "1px solid var(--border)",
  padding: "0.95rem 1rem",
  background: "rgba(255, 255, 255, 0.86)",
  color: "var(--foreground)",
  font: "inherit",
};

const errorStyles: CSSProperties = {
  color: "var(--danger)",
  fontSize: "0.92rem",
};
