import { notFound } from "next/navigation";

import { AttendeeEnrollmentForm } from "@/components/events/attendee-enrollment-form";
import { getEventRegistrationPageData } from "@/lib/events/queries";

type EventRegistrationPageProps = {
  params: Promise<{
    eventSlug: string;
  }>;
};

export default async function EventRegistrationPage({
  params,
}: EventRegistrationPageProps) {
  const { eventSlug } = await params;
  const event = await getEventRegistrationPageData(eventSlug);

  if (!event) {
    notFound();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "clamp(1.25rem, 3vw, 2.5rem)",
      }}
    >
      <div
        style={{
          maxWidth: "72rem",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        <section
          style={{
            padding: "2rem",
            borderRadius: "2rem",
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.95), rgba(255,245,235,0.82))",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow)",
          }}
        >
          <p
            style={{
              color: "var(--accent-strong)",
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              fontSize: "0.78rem",
            }}
          >
            {event.eyebrow}
          </p>
          <h1
            style={{
              marginTop: "1rem",
              fontSize: "clamp(2.5rem, 5vw, 4.25rem)",
              lineHeight: 0.98,
            }}
          >
            {event.title}
          </h1>
          <p style={{ marginTop: "1.25rem", color: "var(--muted)", lineHeight: 1.8 }}>
            {event.description}
          </p>
          <div
            style={{
              display: "grid",
              gap: "0.75rem",
              marginTop: "1.75rem",
              padding: "1.25rem",
              borderRadius: "1.25rem",
              background: "rgba(191, 79, 53, 0.08)",
            }}
          >
            <p>
              <strong>Venue:</strong> {event.venue}
            </p>
            <p>
              <strong>Event date:</strong>{" "}
              {event.formattedScheduledAt}
            </p>
            <p>{event.supportCopy}</p>
          </div>
        </section>

        <section
          style={{
            padding: "2rem",
            borderRadius: "2rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow)",
            backdropFilter: "blur(16px)",
          }}
        >
          <AttendeeEnrollmentForm {...event.formProps} />
        </section>
      </div>
    </main>
  );
}
