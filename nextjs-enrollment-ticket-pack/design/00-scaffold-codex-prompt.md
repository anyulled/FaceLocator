# Scaffold Codex Prompt

You are implementing a narrow feature in a Next.js application using the App Router.

Your task is to implement only the attendee enrollment slice for an event photography workflow.

## Product intent

An attendee lands on an event registration page, enters their name and email, accepts consent, uploads a selfie, and receives a confirmation that their registration is being processed.

This slice only covers the Next.js behavior and backend-for-frontend contracts needed to:
- render the event registration page
- collect name, email, consent, and selfie
- create a registration intent through a Route Handler
- return upload instructions from the backend
- upload the file from the browser using those instructions
- mark upload completion
- poll enrollment status
- render deterministic UX states

Do not implement real AWS internals. Create explicit interfaces and mock implementations instead.

## Constraints

Use:
- Next.js App Router
- Server Components for page shell
- Client Components for interactive form logic
- Route Handlers under `app/api`
- TypeScript
- testable boundaries

Do not use:
- Pages Router API routes
- Server Actions as the primary upload orchestration mechanism
- async Client Components
- ad hoc response shapes
- implicit global state

## Required file structure

```text
app/
  events/
    [eventSlug]/
      register/
        page.tsx
  api/
    attendees/
      register/
        route.ts
      register/
        complete/
          route.ts
      register/
        status/
          [registrationId]/
            route.ts

components/
  events/
    attendee-enrollment-form.tsx
    attendee-enrollment-status.tsx

lib/
  attendees/
    contracts.ts
    schemas.ts
    client.ts
    mapper.ts
    state-machine.ts
    repository.ts
    upload-gateway.ts
    telemetry.ts
    errors.ts
  events/
    queries.ts
```

## Baseline requirements

Implement:
- server-rendered page shell
- client-side form with preview and validation
- shared request/response contracts
- `POST /api/attendees/register`
- `POST /api/attendees/register/complete`
- `GET /api/attendees/register/status/[registrationId]`
- in-memory repository
- mock upload gateway returning placeholder upload instructions
- deterministic enrollment state machine
- uniform error shape
- minimal tests

## Contracts

Registration request:

```json
{
  "eventSlug": "speaker-session-2026",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "contentType": "image/jpeg",
  "fileName": "selfie.jpg",
  "fileSizeBytes": 2481203,
  "consentAccepted": true,
  "submissionKey": "uuid-optional-idempotency-key"
}
```

Registration response:

```json
{
  "registrationId": "reg_123",
  "attendeeId": "att_123",
  "upload": {
    "method": "PUT",
    "url": "SIGNED_UPLOAD_URL_OR_PLACEHOLDER",
    "headers": {
      "Content-Type": "image/jpeg"
    },
    "objectKey": "events/speaker-session-2026/attendees/att_123/selfie.jpg",
    "expiresAt": "2026-04-16T23:59:59Z"
  },
  "status": "UPLOAD_PENDING"
}
```

Completion request:

```json
{
  "registrationId": "reg_123",
  "uploadCompletedAt": "2026-04-16T22:20:10Z"
}
```

Status response:

```json
{
  "registrationId": "reg_123",
  "status": "ENROLLED",
  "message": "Your selfie has been registered."
}
```

Allowed statuses:
- UPLOAD_PENDING
- UPLOADING
- PROCESSING
- ENROLLED
- FAILED
- CANCELLED

Error response:

```json
{
  "error": {
    "code": "INVALID_EMAIL",
    "message": "Email address is invalid.",
    "field": "email"
  }
}
```

## Deliverables

Produce:
- all code files
- comments only where necessary
- minimal tests
- short local run instructions
- clear placeholders where AWS will later be substituted

Implement now.
