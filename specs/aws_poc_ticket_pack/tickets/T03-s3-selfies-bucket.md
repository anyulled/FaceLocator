# T03 — Provision selfies S3 bucket

## Objective
Create a private S3 bucket for attendee selfies.

## Requirements
- bucket name derived from app/environment
- block all public access
- server-side encryption enabled
- bucket intended only for selfie objects
- prefix convention documented, e.g. `events/{eventId}/attendees/{attendeeId}/selfie.jpg`

## Acceptance criteria
- bucket exists
- public access is blocked
- encryption is enabled
- output exposes bucket name
