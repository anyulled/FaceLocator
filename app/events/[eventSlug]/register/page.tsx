import React from "react";
import { notFound } from "next/navigation";
import Image from "next/image";

import { AttendeeEnrollmentForm } from "@/components/events/attendee-enrollment-form";
import { getEventRegistrationPageData } from "@/lib/events/queries";

type EventRegistrationPageProps = {
  params: Promise<{
    eventSlug: string;
  }>;
  searchParams: Promise<{
    registrationId?: string;
  }>;
};

export default async function EventRegistrationPage({
  params,
  searchParams,
}: EventRegistrationPageProps) {
  const { eventSlug } = await params;
  const { registrationId } = (await searchParams) ?? {};
  let event;

  try {
    event = await getEventRegistrationPageData(eventSlug);
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "event-registration-page",
        level: "error",
        message: "Failed to render event registration page",
        eventSlug,
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
      }),
    );

    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "clamp(1.25rem, 3vw, 2.5rem)",
        }}
      >
        <section
          style={{
            width: "min(40rem, 100%)",
            padding: "2rem",
            borderRadius: "2rem",
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.96), rgba(255,245,235,0.88))",
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
            Event registration unavailable
          </p>
          <h1 style={{ marginTop: "0.85rem", fontSize: "clamp(2rem, 4vw, 3.5rem)" }}>
            We could not load this registration page right now.
          </h1>
          <p style={{ marginTop: "1rem", color: "var(--muted)", lineHeight: 1.8 }}>
            This usually means the event record is incomplete or the registration backend is
            temporarily unavailable. Please try again shortly. If the problem persists, check the
            server logs for the event slug <strong>{eventSlug}</strong>.
          </p>
        </section>
      </main>
    );
  }

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
          <Image
            src="/devbcn-logo.svg"
            alt="DevBcn event logo"
            width={320}
            height={130}
            priority
            style={{
              marginTop: "0.75rem",
              width: "100%",
              maxWidth: "21rem",
              height: "auto",
            }}
          />
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
          <AttendeeEnrollmentForm {...event.formProps} initialRegistrationId={registrationId} />
        </section>
      </div>
    </main>
  );
}
