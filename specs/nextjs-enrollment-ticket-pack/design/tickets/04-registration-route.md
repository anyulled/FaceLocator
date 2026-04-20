# Ticket 04 — Registration Intent Route

## Objective
Implement `POST /api/attendees/register`.

## Responsibilities
- Validate request body.
- Resolve event existence.
- Normalize name and email.
- Enforce file metadata constraints.
- Create or reuse a pending registration.
- Return upload instructions from an upload gateway abstraction.

## Response shape
Return:
- `registrationId`
- `attendeeId`
- `upload`
- `status: UPLOAD_PENDING`

## Failure cases
- 400 invalid payload
- 404 event not found
- 409 duplicate active registration when policy demands it
- 422 unsupported file metadata
- 429 rate limited
- 500 safe internal error

## Acceptance criteria
- JSON only.
- Uniform error shape.
- No secrets or stack traces leak in responses.
