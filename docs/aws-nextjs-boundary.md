# Next.js to AWS Boundary Contract

This document fixes the assumptions the Next.js backend must honor when real AWS presign flows replace the mock upload gateway.

## Selfie uploads

- Bucket: Terraform output `selfies_bucket_name`
- Key pattern: `events/{eventId}/attendees/{attendeeId}/{fileName}`
- Required metadata:
  - `event-id`
  - `attendee-id`
  - `registration-id`
  - `consent-version`

## Event-photo uploads

- Bucket: Terraform output `event_photos_bucket_name`
- Pending key pattern: `events/pending/{eventId}/photos/{photoId}.jpg`
- Retained/matched key pattern: `events/matched/{eventId}/photos/{photoId}.jpg`
- Required metadata:
  - `event-id`
  - `photo-id`
  - `uploaded-by`

## Required application environment variables

- `AWS_REGION`
- `FACE_LOCATOR_SELFIES_BUCKET`
- `FACE_LOCATOR_EVENT_PHOTOS_BUCKET`
- `FACE_LOCATOR_SELFIE_KEY_PREFIX`
- `FACE_LOCATOR_EVENT_PHOTO_PENDING_PREFIX`
- `FACE_LOCATOR_AWS_UPLOAD_MODE`

## Identity encoding

- `eventId` and `attendeeId` are encoded directly in the selfie object key.
- `photoId` is encoded directly in the event-photo object key.
- The Lambdas also read S3 metadata so they can log `registration-id`, `consent-version`, and uploader information without guessing.
