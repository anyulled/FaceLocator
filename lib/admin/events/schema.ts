type AdminEventsSchemaQuery = {
  text: string;
  values?: unknown[];
};

export type AdminEventsSchemaQueryable = {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
};

const DEFAULT_PUBLIC_BASE_URL = "https://localhost:3000";

export const ADMIN_EVENTS_SCHEMA_QUERIES: AdminEventsSchemaQuery[] = [
  {
    text: `ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS public_base_url text`,
  },
  {
    text: `ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS venue text`,
  },
  {
    text: `ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS description text`,
  },
  {
    text: `ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS ends_at timestamptz`,
  },
  {
    text: `ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS logo_object_key text`,
  },
  {
    text: `UPDATE events SET public_base_url = $1 WHERE public_base_url IS NULL`,
    values: [DEFAULT_PUBLIC_BASE_URL],
  },
  {
    text: `ALTER TABLE IF EXISTS events ALTER COLUMN public_base_url SET DEFAULT 'https://localhost:3000'`,
  },
  {
    text: `ALTER TABLE IF EXISTS event_attendees DROP CONSTRAINT IF EXISTS event_attendees_consent_id_fkey`,
  },
  {
    text: `ALTER TABLE IF EXISTS event_attendees 
           ADD CONSTRAINT event_attendees_consent_id_fkey 
           FOREIGN KEY (consent_id) REFERENCES consents(id) ON DELETE CASCADE`,
  },
];

let ensureAdminEventsSchemaPromise: Promise<void> | null = null;

async function runAdminEventsSchemaQueries(queryable: AdminEventsSchemaQueryable) {
  for (const query of ADMIN_EVENTS_SCHEMA_QUERIES) {
    await queryable.query(query.text, query.values);
  }
}

export async function ensureAdminEventsSchema(queryable: AdminEventsSchemaQueryable) {
  if (!ensureAdminEventsSchemaPromise) {
    ensureAdminEventsSchemaPromise = runAdminEventsSchemaQueries(queryable).catch((error) => {
      ensureAdminEventsSchemaPromise = null;
      throw error;
    });
  }

  return ensureAdminEventsSchemaPromise;
}

export function resetAdminEventsSchemaEnsurerForTests() {
  ensureAdminEventsSchemaPromise = null;
}
