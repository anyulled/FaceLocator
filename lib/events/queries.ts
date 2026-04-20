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
    title: "DevBcn 2026",
    venue: "World Trade Center, Barcelona",
    scheduledAt: "2026-06-16T09:00:00.000Z",
    endsAt: "2026-06-17T18:00:00.000Z",
    description:
      "Register your selfie so the event photography system can match you to photos captured during DevBcn 2026.",
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
    formattedScheduledAt: formatEventDate(event.scheduledAt, event.endsAt),
    formProps: {
      eventSlug: event.slug,
      eventTitle: event.title,
    },
  };
}

function formatEventDate(startDateIso: string, endDateIso?: string): string {
  const startDate = new Date(startDateIso);

  if (!endDateIso) {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "long",
    }).format(startDate);
  }

  const endDate = new Date(endDateIso);
  const sameMonth = startDate.getUTCFullYear() === endDate.getUTCFullYear()
    && startDate.getUTCMonth() === endDate.getUTCMonth();

  if (sameMonth) {
    const month = new Intl.DateTimeFormat("en", {
      month: "long",
      timeZone: "UTC",
    }).format(startDate);
    const year = new Intl.DateTimeFormat("en", {
      year: "numeric",
      timeZone: "UTC",
    }).format(startDate);
    return `${month} ${startDate.getUTCDate()}-${endDate.getUTCDate()}, ${year}`;
  }

  const startLabel = new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(startDate);
  const endLabel = new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(endDate);
  return `${startLabel} - ${endLabel}`;
}
