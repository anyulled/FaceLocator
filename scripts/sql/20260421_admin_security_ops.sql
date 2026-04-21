alter table if exists events
  add column if not exists venue text;

alter table if exists events
  add column if not exists description text;

alter table if exists events
  add column if not exists ends_at timestamptz;

create index if not exists idx_events_slug
  on events (slug);

create table if not exists admin_photo_delete_audit (
  id text primary key,
  request_id text not null,
  actor_sub text not null,
  event_slug text not null,
  photo_id text not null,
  event_photo_id text,
  result text not null,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_photo_delete_audit_created_at
  on admin_photo_delete_audit (created_at desc);

create index if not exists idx_admin_photo_delete_audit_event_slug
  on admin_photo_delete_audit (event_slug);

create table if not exists admin_batch_delete_idempotency (
  id text primary key,
  event_slug text not null,
  idempotency_key text not null,
  request_hash text not null,
  actor_sub text not null,
  response_payload jsonb not null,
  status_code integer not null default 200,
  created_at timestamptz not null default now(),
  unique (event_slug, idempotency_key)
);

create index if not exists idx_admin_batch_delete_idempotency_created_at
  on admin_batch_delete_idempotency (created_at desc);
