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
- Desktop uploads request a presigned PUT contract from `POST /api/admin/events/{eventSlug}/photos/presign`.
- `uploaded-by` is derived server-side from the authenticated admin identity and is not client-controlled.

## Required application environment variables

- `AWS_REGION`
- `FACE_LOCATOR_SELFIES_BUCKET`
- `FACE_LOCATOR_EVENT_PHOTOS_BUCKET`
- `FACE_LOCATOR_SELFIE_KEY_PREFIX`
- `FACE_LOCATOR_EVENT_PHOTO_PENDING_PREFIX`
- `FACE_LOCATOR_AWS_UPLOAD_MODE`
- `DATABASE_SECRET_NAME` or `FACE_LOCATOR_DATABASE_SECRET_NAME` when the app runs against the PostgreSQL repository
- `PUBLIC_REGISTRATION_BACKEND=lambda` and `FACE_LOCATOR_ATTENDEE_REGISTRATION_LAMBDA_NAME` when Aurora is private and public registration DB work must run through the VPC-attached Lambda
- `FACE_LOCATOR_MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME` when the hosted runtime serves gallery and unsubscribe magic links through the VPC-attached matched-photo-notifier Lambda
- `MATCH_LINK_BACKEND=direct` only for local troubleshooting; production defaults to the Lambda path when the variable is omitted

## Hosted runtime identities

- GitHub Actions assumes a dedicated OIDC role for CI, live E2E, and post-merge hosted smoke verification.
- AWS Amplify assumes a separate runtime role trusted by `amplify.amazonaws.com`.
- The hosted Next.js runtime must not reuse the Lambda execution roles.
- Public registration event reads and attendee registration writes should invoke the VPC-attached attendee registration Lambda when the database is private.
- Magic-link gallery reads and unsubscribe writes should invoke the VPC-attached matched-photo-notifier Lambda when the database is private.
- The matched-photo-notifier Lambda signs gallery image URLs, so its execution role must allow `s3:GetObject` on `s3://<event_photos_bucket_name>/events/matched/*`. A presigned URL still returns 403 when the signing principal lacks that read permission.

The production deployment flow and recommended trust policies are documented in [docs/aws-amplify-deployment.md](/Users/anyulled/IdeaProjects/FaceLocator/docs/aws-amplify-deployment.md).

## Identity encoding

- `eventId` and `attendeeId` are encoded directly in the selfie object key.
- `photoId` is encoded directly in the event-photo object key.
- The Lambdas also read S3 metadata so they can log `registration-id`, `consent-version`, and uploader information without guessing.
