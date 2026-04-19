import type { EnrollmentEventSummary } from "@/lib/attendees/contracts";

export type EnrollmentFormEventProps = {
  eventSlug: string;
  eventTitle: string;
};

export type EventRegistrationPageData = EnrollmentEventSummary & {
  eyebrow: string;
  supportCopy: string;
  formattedScheduledAt: string;
  formProps: EnrollmentFormEventProps;
};

const events: EnrollmentEventSummary[] = [
  {
    slug: "speaker-session-2026",
    title: "Speaker Session 2026",
    venue: "Teatro del Prado, Madrid",
    scheduledAt: "2026-09-24T18:30:00.000Z",
    description:
      "Register your selfie so the event photography system can match you to photos captured during the speaker showcase.",
  },
];

export async function getEventBySlug(slug: string): Promise<EnrollmentEventSummary | null> {
  return events.find((event) => event.slug === slug) ?? null;
}

export async function getEventRegistrationPageData(
  slug: string,
): Promise<EventRegistrationPageData | null> {
  const event = await getEventBySlug(slug);

  if (!event) {
    return null;
  }

  return {
    ...event,
    eyebrow: "Event registration",
    supportCopy:
      "Upload flow stays mock-backed in this scaffold so the future AWS substitution remains isolated.",
    formattedScheduledAt: new Intl.DateTimeFormat("en", {
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date(event.scheduledAt)),
    formProps: {
      eventSlug: event.slug,
      eventTitle: event.title,
    },
  };
}
