import type { EnrollmentEventSummary } from "@/lib/attendees/contracts";
import { getDatabasePool } from "@/lib/aws/database";

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

const DEMO_EVENT: EnrollmentEventSummary = {
  slug: "speaker-session-2026",
  title: "DevBcn 2026",
  venue: "World Trade Center, Barcelona",
  scheduledAt: "2026-06-16T09:00:00.000Z",
  endsAt: "2026-06-17T18:00:00.000Z",
  description:
    "Register your selfie so the event photography system can match you to photos captured during DevBcn 2026.",
};

type EventRow = {
  slug: string;
  title: string;
  venue: string | null;
  description: string | null;
  scheduledAt: string | null;
  endsAt: string | null;
};

export async function getEventBySlug(slug: string): Promise<EnrollmentEventSummary | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) {
    return null;
  }

  if (process.env.NODE_ENV !== "test") {
    try {
      const pool = await getDatabasePool();
      const result = await pool.query<EventRow>(
        `
          SELECT
            slug,
            title,
            venue,
            description,
            scheduled_at AS "scheduledAt",
            ends_at AS "endsAt"
          FROM events
          WHERE slug = $1
          LIMIT 1
        `,
        [normalizedSlug],
      );

      const row = result.rows[0];
      if (row) {
        return {
          slug: row.slug,
          title: row.title,
          venue: row.venue ?? "",
          scheduledAt: row.scheduledAt ?? new Date(0).toISOString(),
          endsAt: row.endsAt ?? undefined,
          description: row.description ?? "",
        };
      }
    } catch (error) {
      if (normalizedSlug === DEMO_EVENT.slug) {
        return DEMO_EVENT;
      }
      throw error;
    }
  }

  return normalizedSlug === DEMO_EVENT.slug ? DEMO_EVENT : null;
}

export async function getFeaturedEventSlug(): Promise<string> {
  if (process.env.NODE_ENV === "test") {
    return DEMO_EVENT.slug;
  }

  try {
    const pool = await getDatabasePool();
    const result = await pool.query<{ slug: string }>(
      `
        SELECT slug
        FROM events
        ORDER BY created_at DESC NULLS LAST, scheduled_at DESC NULLS LAST
        LIMIT 1
      `,
    );

    return result.rows[0]?.slug ?? DEMO_EVENT.slug;
  } catch {
    return DEMO_EVENT.slug;
  }
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
      "The registration flow now reads the live event record so the website stays aligned with the database.",
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
