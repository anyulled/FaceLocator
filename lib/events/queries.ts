import type { EnrollmentEventSummary } from "@/lib/attendees/contracts";

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

export async function getEventBySlug(slug: string) {
  return events.find((event) => event.slug === slug) ?? null;
}
