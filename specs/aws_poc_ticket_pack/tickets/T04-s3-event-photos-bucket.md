# T04 — Provision event-photos S3 bucket

## Objective
Create a private S3 bucket for event/session photos that will later be compared against enrolled faces.

## Requirements
- separate bucket from selfies
- block all public access
- server-side encryption enabled
- prefix convention documented, e.g. `events/{eventId}/photos/{photoId}.jpg`

## Acceptance criteria
- bucket exists
- public access is blocked
- encryption is enabled
- output exposes bucket name
