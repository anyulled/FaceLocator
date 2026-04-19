# AWS Retention and Delete Policy

## Retention rules

- Selfies expire after `selfie_retention_days`, which defaults to `30`.
- Raw event-photo uploads under `events/pending/` expire after `unmatched_event_photo_retention_days`, which defaults to `2`.
- Temporary derived artifacts expire after `temporary_artifact_retention_days`, which defaults to `1`.

## S3 lifecycle behavior

- Terraform applies lifecycle rules to both buckets.
- The 2-day unmatched event-photo rule is implemented against the pending upload prefix.
- If application logic decides a photo must be retained longer, it must copy or move the object out of the pending prefix before the lifecycle deadline.

## Delete workflow

Operator-driven deletion for biometric data currently combines infrastructure deletion and application cleanup:

1. Remove the attendee selfie objects from the selfies bucket.
2. Delete the Rekognition face enrollment entry when the `FaceId` is known.
3. Delete or tombstone enrollment and match rows in PostgreSQL.
4. Mark consent as withdrawn and update the event-attendee row.
5. Inspect any retained event photos and remove them if policy or the user request requires it.

The executable placeholder for this flow is [scripts/delete-biometric-data.sh](/Users/anyulled/IdeaProjects/FaceLocator/scripts/delete-biometric-data.sh).
