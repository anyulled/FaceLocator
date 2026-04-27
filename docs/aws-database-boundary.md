# AWS PostgreSQL Boundary

The POC provisions a Terraform-managed Aurora PostgreSQL Serverless v2 cluster as the database boundary. The runtime contract is fixed now.

## Credentials source

- Worker Lambdas read database connection details from the Secrets Manager secret output as `database_secret_name`.
- Terraform writes the managed Aurora writer endpoint into that secret after the cluster is created.
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

- The Aurora cluster is provisioned in private subnets in the AWS account's default VPC.
- Public database access is disabled.
- The cluster security group allows PostgreSQL traffic only from:
  - optional operator CIDR blocks configured in `database_allowed_cidr_blocks`
  - the Lambda runtime security group for worker and API Lambdas
- VPC endpoints for S3, Secrets Manager, Rekognition, and SES keep Lambda egress private while Lambdas remain VPC-attached.

## Deferred optimization path

- Full Lambda VPC removal is not compatible with the current direct PostgreSQL client model.
- If cost or latency pressure justifies another redesign, evaluate one of these explicit follow-up paths:
  - move database access behind a different service boundary
  - adopt Aurora Data API and refactor callers accordingly
  - accept a different egress design with its own cost and security trade-offs
- Do not remove interface endpoints or Lambda VPC attachment as an isolated optimization change.

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
