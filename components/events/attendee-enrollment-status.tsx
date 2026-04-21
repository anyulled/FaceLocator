import React from "react";
import type { EnrollmentUiState } from "@/lib/attendees/contracts";

type AttendeeEnrollmentStatusProps = {
  state: EnrollmentUiState;
  message: string;
  registrationId?: string;
};

export function AttendeeEnrollmentStatus({
  state,
  message,
  registrationId,
}: AttendeeEnrollmentStatusProps) {
  const tone =
    state === "FAILED"
      ? "var(--danger)"
      : state === "ENROLLED"
        ? "var(--success)"
        : "var(--accent-strong)";

  return (
    <section
      aria-live="polite"
      aria-atomic="true"
      style={{
        padding: "1rem 1.1rem",
        borderRadius: "1rem",
        border: `1px solid ${tone}`,
        background: "rgba(255, 255, 255, 0.8)",
      }}
    >
      <p
        style={{
          color: tone,
          fontSize: "0.8rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {state.replaceAll("_", " ")}
      </p>
      <p
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        Enrollment status update
      </p>
      <p style={{ marginTop: "0.35rem", lineHeight: 1.6 }}>{message}</p>
      {registrationId ? (
        <p style={{ marginTop: "0.5rem", color: "var(--muted)", fontSize: "0.92rem" }}>
          Registration reference: {registrationId}
        </p>
      ) : null}
    </section>
  );
}
