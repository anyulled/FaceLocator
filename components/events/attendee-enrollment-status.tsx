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
      <p style={{ marginTop: "0.35rem", lineHeight: 1.6 }}>{message}</p>
      {registrationId ? (
        <p style={{ marginTop: "0.5rem", color: "var(--muted)", fontSize: "0.92rem" }}>
          Registration reference: {registrationId}
        </p>
      ) : null}
    </section>
  );
}
