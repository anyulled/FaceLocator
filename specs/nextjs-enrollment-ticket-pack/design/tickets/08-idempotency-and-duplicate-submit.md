# Ticket 08 — Idempotency and Duplicate Submission

## Objective
Make repeated submissions safe.

## Requirements
- Support client-generated `submissionKey`.
- Same key within a bounded window returns the same logical registration.
- Double-clicking submit must not create multiple registrations.

## Acceptance criteria
- Duplicate click behavior is deterministic.
- Timeouts can be retried safely.
- Unit and route tests cover idempotent behavior.
