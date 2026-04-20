# Ticket 14 — Logging and Correlation IDs

## Objective
Make the flow debuggable.

## Requirements
- Generate or propagate a request correlation id.
- Include `registrationId` once available.
- Include `eventSlug` where relevant.
- Log stable error codes.
- Be conservative with PII.

## Acceptance criteria
- Every route handler path emits structured logs.
- A client-visible failure can be correlated to a server request.
