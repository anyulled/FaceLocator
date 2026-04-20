# AWS PostgreSQL Boundary

The POC keeps database provisioning intentionally minimal while still provisioning a Terraform-managed PostgreSQL-compatible RDS instance. The runtime contract is fixed now.

## Credentials source

- Worker Lambdas read database connection details from the Secrets Manager secret output as `database_secret_name`.
- Terraform writes the managed RDS endpoint into that secret after the instance is created.
- The secret JSON shape is:

```json
{
  "host": "db.example.internal",
  "port": 5432,
  "dbname": "face_locator",
  "username": "face_locator_app",
  "password": "generated-or-supplied-at-apply-time"
}
```

## Network boundary

- The RDS instance is provisioned in the AWS account's default VPC and default subnets for this POC.
- `publicly_accessible` is disabled, so the endpoint is not exposed directly on the public internet.
- `database_allowed_cidr_blocks` exists only for tightly scoped operator access if that is later needed; the default is an empty list, which keeps the security group from allowing any inbound PostgreSQL traffic.

## Required logical tables

- `events`
- `attendees`
- `event_attendees`
- `consents`
- `face_enrollments`
- `event_photos`
- `photo_face_matches`

## Schema bootstrap

- Apply [scripts/sql/bootstrap.sql](/Users/anyulled/IdeaProjects/FaceLocator/scripts/sql/bootstrap.sql) against the chosen PostgreSQL instance before enabling worker traffic.
- The SQL includes consent storage with `consent_text_version`, `granted_at`, and `withdrawn_at`.
- `event_attendees.consent_id` and `event_attendees.enrollment_status` make it explicit that enrollment is not valid without a corresponding consent record.

## Minimum consent wording

The consent text stored in `consents.consent_text` must explicitly cover:

- selfie use for facial matching against event or session photos
- later delivery of matched photos back to the attendee

Baseline wording for the POC:

`I consent to FaceLocator using my selfie for facial matching against event photos and for later delivery of matched photos.`
