# Ticket 05 — Completion Route

## Objective
Implement `POST /api/attendees/register/complete`.

## Responsibilities
- Accept `registrationId` and `uploadCompletedAt`.
- Transition UI-visible state from upload to processing.
- Be idempotent.

## Acceptance criteria
- Safe to retry.
- Repeated calls do not corrupt state.
- Returns deterministic `PROCESSING` state when successful.
