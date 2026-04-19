# AWS POC Verification Checklist

## Infrastructure validation

1. Run `terraform -chdir=infra init`.
2. Run `terraform -chdir=infra validate`.
3. Run `terraform -chdir=infra plan` with the intended profile and variables.

Observable outcome:
- Terraform resolves all providers, validates the graph, and shows the expected buckets, roles, secret, Rekognition collection, and Lambda resources.

## Selfie flow

1. Upload a test selfie to `s3://<selfies_bucket_name>/events/<eventId>/attendees/<attendeeId>/<fileName>`.
2. Include S3 metadata for `event-id`, `attendee-id`, `registration-id`, and `consent-version`.
3. Inspect the selfie Lambda CloudWatch log group.

Observable outcome:
- A log entry includes the object key, event id, attendee id, and `outcome: "enrolled"` or a clear failure.

## Event-photo flow

1. Upload a test event photo to `s3://<event_photos_bucket_name>/events/pending/<eventId>/photos/<photoId>.jpg`.
2. Include S3 metadata for `event-id`, `photo-id`, and `uploaded-by`.
3. Inspect the event-photo worker CloudWatch log group.

Observable outcome:
- A log entry includes the object key, event id, photo id, and `outcome: "ready_for_matching"` or `outcome: "matches_found"`.

## Retention and IAM

1. Inspect Terraform state or the AWS console for lifecycle rules on both buckets.
2. Confirm the event-photo pending prefix expires after 2 days.
3. Confirm the selfie worker role does not include event-photo bucket access.
4. Confirm the event-photo worker role does not include selfie bucket access.
5. Confirm the Next.js presign policy is scoped to the documented upload prefixes only.

Observable outcome:
- Lifecycle and least-privilege decisions are visible and auditable without secret values being exposed.
