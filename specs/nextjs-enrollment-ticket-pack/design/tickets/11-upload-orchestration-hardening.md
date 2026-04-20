# Ticket 11 — Upload Orchestration Hardening

## Objective
Isolate upload choreography and failure handling.

## Requirements
- Keep upload gateway behind `lib/attendees/upload-gateway.ts`.
- Keep browser orchestration in a narrow client abstraction.
- Handle upload failure separately from registration creation failure.
- Preserve entered name and email on retryable failures.

## Acceptance criteria
- Upload logic is not smeared across UI code.
- Upload retries do not recreate registrations unnecessarily.
