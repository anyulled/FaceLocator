import type { EnrollmentEventSummary } from "@/lib/attendees/contracts";
import { getDatabasePool } from "@/lib/aws/database";
import { describeDatabaseError } from "@/lib/aws/database-errors";

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
  slug: unknown;
  title: unknown;
  venue: unknown;
  description: unknown;
  scheduledAt: unknown;
  endsAt: unknown;
};

function readText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeIsoDate(value: unknown, fallback?: string) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return fallback;
}

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
        const scheduledAt = normalizeIsoDate(row.scheduledAt, "") ?? "";
        const endsAt = normalizeIsoDate(row.endsAt);

        return {
          slug: readText(row.slug, normalizedSlug),
          title: readText(row.title, normalizedSlug),
          venue: readText(row.venue),
          scheduledAt,
          endsAt,
          description: readText(row.description),
        };
      }
    } catch (error) {
      if (normalizedSlug === DEMO_EVENT.slug) {
        return DEMO_EVENT;
      }

      console.error(
        JSON.stringify({
          ...describeDatabaseError(error, "loading public event registration"),
          scope: "event-registration",
          level: "error",
          summary: "Failed to load event registration data",
          eventSlug: normalizedSlug,
        }),
      );
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
  if (!Number.isFinite(startDate.getTime())) {
    return "Date to be announced";
  }

  if (!endDateIso) {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "long",
    }).format(startDate);
  }

  const endDate = new Date(endDateIso);
  if (!Number.isFinite(endDate.getTime())) {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(startDate);
  }

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
