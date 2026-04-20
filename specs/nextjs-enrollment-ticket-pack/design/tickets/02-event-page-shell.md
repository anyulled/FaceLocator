# Ticket 02 — Event Page Shell

## Objective
Implement the event registration page as a Server Component.

## Requirements
- Create `app/events/[eventSlug]/register/page.tsx`.
- Resolve event metadata through `lib/events/queries.ts`.
- Render title, explanatory copy, and the enrollment form.
- Handle missing event via not-found behavior or equivalent.
- Pass only serializable props into the Client Component.

## Non-goals
- No file handling.
- No direct submission logic.
- No mutable upload orchestration in the page component.

## Acceptance criteria
- Static event copy renders server-side.
- Event lookup is abstracted.
- Missing events are handled deterministically.
