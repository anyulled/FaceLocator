# Ticket 06 — Status Route

## Objective
Implement `GET /api/attendees/register/status/[registrationId]`.

## Responsibilities
- Return current registration status and message.
- Hide internal diagnostics.
- Return `404` for unknown IDs.

## Allowed statuses
- UPLOAD_PENDING
- UPLOADING
- PROCESSING
- ENROLLED
- FAILED
- CANCELLED

## Acceptance criteria
- Response contract is stable.
- Poll-safe semantics.
- No sensitive data leaked.
