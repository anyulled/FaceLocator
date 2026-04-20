# Ticket 10 — Uniform Error Model

## Objective
Standardize all route handler error responses.

## Required error codes
- INVALID_EVENT
- INVALID_NAME
- INVALID_EMAIL
- MISSING_FILE
- UNSUPPORTED_CONTENT_TYPE
- FILE_TOO_LARGE
- CONSENT_REQUIRED
- DUPLICATE_REGISTRATION
- RATE_LIMITED
- INTERNAL_ERROR

## Requirements
- Implement shared error helpers in `lib/attendees/errors.ts`.
- Every 4xx must include machine-readable `code`.
- 500s must not expose internals.

## Acceptance criteria
- No ad hoc error payloads remain.
- Components can map field errors deterministically.
