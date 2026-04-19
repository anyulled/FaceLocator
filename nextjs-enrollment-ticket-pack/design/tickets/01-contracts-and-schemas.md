# Ticket 01 — Shared Contracts and Schemas

## Objective
Consolidate all request, response, status, upload, and error contracts into shared TypeScript types and validation schemas.

## Requirements
- Implement shared types in `lib/attendees/contracts.ts`.
- Implement schemas and normalization helpers in `lib/attendees/schemas.ts`.
- Ensure client and server consume the same canonical shapes.

## Required types
- `EnrollmentStatus`
- `UploadInstructions`
- `RegistrationIntentRequest`
- `RegistrationIntentResponse`
- `RegistrationCompleteRequest`
- `RegistrationStatusResponse`
- `ApiErrorResponse`

## Validation rules
- `name`: trimmed, min 2, max 120
- `email`: trimmed, lowercase normalized, pragmatic email validation
- `consentAccepted`: must be `true`
- `contentType`: allowlist image types only
- `fileName`: non-empty, bounded length
- `fileSizeBytes`: positive integer, bounded by configured max

## Acceptance criteria
- No duplicated contract literals in route handlers or components.
- Validation helpers return machine-readable issues.
- Normalization logic is unit tested.
