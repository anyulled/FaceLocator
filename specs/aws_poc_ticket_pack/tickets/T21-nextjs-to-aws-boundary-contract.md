# T21 — Define the Next.js to AWS boundary contract

## Objective
Make the infrastructure assumptions explicit for the application developers.

## Required contracts
- selfie upload key pattern
- event-photo upload key pattern
- required metadata fields
- required environment variables for presign logic
- how the app identifies event id and attendee id in object keys or metadata

## Acceptance criteria
- the contract is documented in markdown
- app developers can implement presign logic without guessing infrastructure conventions
