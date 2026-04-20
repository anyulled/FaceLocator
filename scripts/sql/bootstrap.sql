create extension if not exists pgcrypto;

create table if not exists events (
  id text primary key,
  slug text not null unique,
  title text not null,
  public_base_url text not null default 'https://localhost:3000',
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists attendees (
  id text primary key,
  email text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (email)
);

create table if not exists consents (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  attendee_id text not null references attendees(id) on delete cascade,
  consent_text_version text not null,
  consent_text text not null,
  granted_at timestamptz not null,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists event_attendees (
  event_id text not null references events(id) on delete cascade,
  attendee_id text not null references attendees(id) on delete cascade,
  consent_id text references consents(id) on delete set null,
  enrollment_status text not null default 'pending',
  withdrawal_at timestamptz,
  photo_notifications_unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, attendee_id)
);

create table if not exists face_enrollments (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  attendee_id text not null references attendees(id) on delete cascade,
  registration_id text,
  submission_key text,
  selfie_object_key text not null,
  rekognition_face_id text,
  external_image_id text,
  status text not null,
  enrolled_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists event_photos (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  object_key text not null,
  status text not null,
  uploaded_at timestamptz not null,
  matched_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists photo_face_matches (
  id text primary key,
  event_photo_id text not null references event_photos(id) on delete cascade,
  attendee_id text not null references attendees(id) on delete cascade,
  face_enrollment_id text references face_enrollments(id) on delete set null,
  similarity numeric(5,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists matched_photo_notifications (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  attendee_id text not null references attendees(id) on delete cascade,
  face_enrollment_id text references face_enrollments(id) on delete set null,
  match_count integer not null,
  provider_message_id text,
  sent_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_consents_event_attendee
  on consents (event_id, attendee_id);

create index if not exists idx_face_enrollments_event_attendee
  on face_enrollments (event_id, attendee_id);

alter table if exists face_enrollments
  add column if not exists submission_key text;

alter table if exists events
  add column if not exists public_base_url text;

update events
set public_base_url = 'https://localhost:3000'
where public_base_url is null;

alter table if exists events
  alter column public_base_url set not null;

alter table if exists events
  alter column public_base_url set default 'https://localhost:3000';

alter table if exists event_attendees
  add column if not exists photo_notifications_unsubscribed_at timestamptz;

delete from face_enrollments
where id in (
  select id
  from (
    select id,
           row_number() over (
             partition by registration_id
             order by
               case status
                 when 'enrolled' then 3
                 when 'processing' then 2
                 when 'pending' then 1
                 else 0
               end desc,
               created_at desc
           ) as row_number
    from face_enrollments
    where registration_id is not null
      and deleted_at is null
  ) ranked
  where ranked.row_number > 1
);

delete from photo_face_matches
where id in (
  select id
  from (
    select id,
           row_number() over (
             partition by event_photo_id, attendee_id
             order by similarity desc, created_at desc
           ) as row_number
    from photo_face_matches
  ) ranked
  where ranked.row_number > 1
);

create unique index if not exists idx_face_enrollments_registration_id_unique
  on face_enrollments (registration_id)
  where registration_id is not null and deleted_at is null;

create unique index if not exists idx_face_enrollments_submission_key_unique
  on face_enrollments (submission_key)
  where submission_key is not null and deleted_at is null;

create index if not exists idx_event_photos_event
  on event_photos (event_id);

create index if not exists idx_photo_face_matches_photo
  on photo_face_matches (event_photo_id);

create unique index if not exists idx_photo_face_matches_photo_attendee_unique
  on photo_face_matches (event_photo_id, attendee_id);

create unique index if not exists idx_matched_photo_notifications_event_attendee_unique
  on matched_photo_notifications (event_id, attendee_id);

create index if not exists idx_matched_photo_notifications_event
  on matched_photo_notifications (event_id);
