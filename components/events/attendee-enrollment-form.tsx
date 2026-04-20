"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useState } from "react";

import { AttendeeEnrollmentStatus } from "@/components/events/attendee-enrollment-status";
import { completeRegistration, createRegistrationIntent, getRegistrationStatus, uploadSelfie } from "@/lib/attendees/client";
import { ENROLLMENT_COPY } from "@/lib/attendees/copy";
import type { ApiErrorField, ApiErrorResponse, EnrollmentUiState } from "@/lib/attendees/contracts";
import { mapApiErrorToFieldErrors } from "@/lib/attendees/mapper";
import { pollRegistrationStatus } from "@/lib/attendees/orchestrator";
import { getEnrollmentStateMessage, enrollmentInitialState } from "@/lib/attendees/state-machine";
import {
  SELFIE_FILE_ACCEPT,
  getRegistrationIntentValidationIssues,
  validateRegistrationIntentRequest,
} from "@/lib/attendees/schemas";
import { trackEnrollmentEvent } from "@/lib/attendees/telemetry";
import type { EnrollmentFormEventProps } from "@/lib/events/queries";

type FieldErrors = Partial<Record<ApiErrorField, string>>;

type AttendeeEnrollmentFormProps = EnrollmentFormEventProps & {
  initialRegistrationId?: string;
};

export function AttendeeEnrollmentForm({
  eventSlug,
  eventTitle,
  initialRegistrationId,
}: AttendeeEnrollmentFormProps) {
  const pathname = usePathname();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submissionKey, setSubmissionKey] = useState<string | null>(null);
  const [machine, setMachine] = useState(enrollmentInitialState);
  const [statusMessage, setStatusMessage] = useState(
    getEnrollmentStateMessage(enrollmentInitialState),
  );
  const [registrationId, setRegistrationId] = useState<string | undefined>(
    initialRegistrationId,
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    trackEnrollmentEvent("enrollment_form_viewed", { eventSlug });
  }, [eventSlug]);

  useEffect(() => {
    if (!initialRegistrationId) {
      return;
    }

    let cancelled = false;

    void pollRegistrationStatus(getRegistrationStatus, initialRegistrationId, (status) => {
      if (cancelled) {
        return;
      }

      setRegistrationId(initialRegistrationId);

      if (status.status === "ENROLLED") {
        setMachine({ value: "ENROLLED" });
        setStatusMessage(status.message);
        return;
      }

      if (status.status === "FAILED" || status.status === "CANCELLED") {
        setMachine({ value: "FAILED" });
        setStatusMessage(status.message);
        return;
      }

      if (status.status === "PROCESSING") {
        setMachine({ value: "PROCESSING" });
        setStatusMessage(status.message);
        return;
      }

      setMachine({ value: "READY_TO_UPLOAD" });
      setStatusMessage(status.message);
    }).catch(() => {
      if (!cancelled) {
        setMachine({ value: "FAILED" });
        setStatusMessage(ENROLLMENT_COPY.genericFailure);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initialRegistrationId]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const isWorking = !["IDLE", "FAILED", "ENROLLED", "READY_TO_UPLOAD"].includes(machine.value);

  function updateMachine(nextState: EnrollmentUiState, nextMessage?: string) {
    setMachine({ value: nextState });
    setStatusMessage(nextMessage ?? getEnrollmentStateMessage({ value: nextState }));
  }

  function persistRegistrationId(nextRegistrationId: string) {
    setRegistrationId(nextRegistrationId);
    const nextUrl = `${pathname}?registrationId=${nextRegistrationId}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }

  function handleSelectedFile(file: File | null) {
    setFieldErrors((current) => ({
      ...current,
      selfie: undefined,
    }));

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setSelectedFile(null);
      setFieldErrors((current) => ({
        ...current,
        selfie: "Only JPEG, PNG, and WEBP images are supported.",
      }));
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(nextPreviewUrl);
    trackEnrollmentEvent("enrollment_file_selected", { eventSlug });
  }

  async function handleSubmit(formDataEvent: FormEvent<HTMLFormElement>) {
    formDataEvent.preventDefault();

    setFieldErrors({});
    updateMachine("VALIDATING");

    const nextSubmissionKey = submissionKey ?? crypto.randomUUID();
    setSubmissionKey(nextSubmissionKey);

    const draftPayload = {
      eventSlug,
      name,
      email,
      contentType: selectedFile?.type ?? "",
      fileName: selectedFile?.name ?? "",
      fileSizeBytes: selectedFile?.size ?? 0,
      consentAccepted,
      submissionKey: nextSubmissionKey,
    };

    const validationIssues = getRegistrationIntentValidationIssues(draftPayload);
    if (validationIssues.length > 0) {
      const nextFieldErrors = validationIssues.reduce<FieldErrors>((accumulator, issue) => {
        if (issue.field && !accumulator[issue.field]) {
          accumulator[issue.field] = issue.message;
        }
        return accumulator;
      }, {});

      setFieldErrors(nextFieldErrors);
      updateMachine("FAILED", validationIssues[0].message);
      return;
    }

    try {
      const payload = validateRegistrationIntentRequest(draftPayload);
      trackEnrollmentEvent("enrollment_submit_clicked", { eventSlug });

      updateMachine("CREATING_REGISTRATION");
      const registration = await createRegistrationIntent(payload);
      persistRegistrationId(registration.registrationId);
      updateMachine("READY_TO_UPLOAD");
      trackEnrollmentEvent("enrollment_registration_created", { eventSlug });

      if (!selectedFile) {
        updateMachine("FAILED", "Please select a selfie to upload.");
        return;
      }

      updateMachine("UPLOADING");
      trackEnrollmentEvent("enrollment_upload_started", { eventSlug });
      await uploadSelfie(registration.upload, selectedFile);
      trackEnrollmentEvent("enrollment_upload_succeeded", { eventSlug });

      updateMachine("UPLOAD_CONFIRMED");
      const completion = await completeRegistration({
        registrationId: registration.registrationId,
        uploadCompletedAt: new Date().toISOString(),
      });

      updateMachine("PROCESSING", completion.message);
      trackEnrollmentEvent("enrollment_processing_seen", { eventSlug });

      const terminalStatus = await pollRegistrationStatus(
        getRegistrationStatus,
        registration.registrationId,
        (status) => {
          if (status.status === "ENROLLED") {
            updateMachine("ENROLLED", status.message);
            return;
          }

          if (status.status === "FAILED" || status.status === "CANCELLED") {
            updateMachine("FAILED", status.message);
            return;
          }

          updateMachine("PROCESSING", status.message);
        },
      );

      if (terminalStatus.status === "ENROLLED") {
        trackEnrollmentEvent("enrollment_completed", { eventSlug });
      } else if (
        terminalStatus.status === "FAILED" ||
        terminalStatus.status === "CANCELLED"
      ) {
        trackEnrollmentEvent("enrollment_failed", { eventSlug });
      }
    } catch (error) {
      const apiError = error as ApiErrorResponse;
      const mappedErrors = apiError.error ? mapApiErrorToFieldErrors(apiError.error) : {};
      setFieldErrors(mappedErrors);
      updateMachine(
        "FAILED",
        apiError.error?.message ?? ENROLLMENT_COPY.genericFailure,
      );
      trackEnrollmentEvent("enrollment_failed", { eventSlug });
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
      <p
        style={{
          color: "var(--accent-strong)",
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          fontSize: "0.78rem",
          margin: 0,
        }}
      >
        {ENROLLMENT_COPY.formEyebrow}
      </p>

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
          aria-invalid={fieldErrors.name ? "true" : "false"}
          aria-describedby={fieldErrors.name ? "name-error" : undefined}
        />
        {fieldErrors.name ? (
          <p id="name-error" style={errorStyles}>
            {fieldErrors.name}
          </p>
        ) : null}
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
          aria-invalid={fieldErrors.email ? "true" : "false"}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
        />
        {fieldErrors.email ? (
          <p id="email-error" style={errorStyles}>
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: "0.45rem" }}>
        <label htmlFor="selfie" style={{ fontWeight: 600 }}>
          Selfie upload
        </label>
        <input
          id="selfie"
          name="selfie"
          type="file"
          accept={SELFIE_FILE_ACCEPT}
          multiple={false}
          onChange={(changeEvent) => {
            handleSelectedFile(changeEvent.target.files?.[0] ?? null);
          }}
          style={inputStyles}
          aria-invalid={fieldErrors.selfie ? "true" : "false"}
          aria-describedby={fieldErrors.selfie ? "selfie-error" : "selfie-help"}
        />
        {previewUrl ? (
          <figure
            style={{
              display: "grid",
              gap: "0.5rem",
              margin: 0,
            }}
          >
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
            <figcaption style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
              Preview of the currently selected selfie.
            </figcaption>
          </figure>
        ) : (
          <p id="selfie-help" style={{ color: "var(--muted)", fontSize: "0.95rem" }}>
            {ENROLLMENT_COPY.fileHelpText}
          </p>
        )}
        {fieldErrors.selfie ? (
          <p id="selfie-error" style={errorStyles}>
            {fieldErrors.selfie}
          </p>
        ) : null}
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
          aria-invalid={fieldErrors.consentAccepted ? "true" : "false"}
          aria-describedby={fieldErrors.consentAccepted ? "consent-error" : undefined}
        />
        <span style={{ lineHeight: 1.6 }}>
          {ENROLLMENT_COPY.consentLabel} This enrollment is for {eventTitle}.
        </span>
      </label>
      {fieldErrors.consentAccepted ? (
        <p id="consent-error" style={errorStyles}>
          {fieldErrors.consentAccepted}
        </p>
      ) : null}
      <details
        style={{
          border: "1px solid var(--border)",
          borderRadius: "1rem",
          padding: "0.9rem 1rem",
          background: "rgba(255, 255, 255, 0.7)",
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
          GDPR and data retention details
        </summary>
        <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.65rem", color: "var(--muted)" }}>
          <p style={{ margin: 0 }}>
            We process your selfie only for facial matching against event photos taken at {eventTitle}.
          </p>
          <p style={{ margin: 0 }}>
            Selfies are retained for up to 30 days in this enrollment flow, then deleted according to retention policy.
          </p>
          <p style={{ margin: 0 }}>
            You can request deletion or consent withdrawal at any time, and your registration data will no longer be used for future matching.
          </p>
        </div>
      </details>

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
        {isWorking ? ENROLLMENT_COPY.submitButtonBusy : ENROLLMENT_COPY.submitButtonIdle}
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
