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
6. Confirm the GitHub Actions OIDC trust is limited to `anyulled/FaceLocator` pull requests and the `main` branch.
7. Confirm the Amplify runtime role is trusted by `amplify.amazonaws.com` only.

Observable outcome:

- Lifecycle and least-privilege decisions are visible and auditable without secret values being exposed.

## Security and cost guardrails

1. Run `terraform -chdir=infra output monthly_cost_budget_name`.
2. Run `terraform -chdir=infra output monthly_cost_budget_limit_usd`.
3. Confirm the Cognito user pool is configured with `OPTIONAL` MFA.
4. Confirm admin operators have enrolled an MFA factor before production use.

Observable outcome:

- The budget alarm exists with the intended threshold, and admin authentication has MFA capability enabled.

## Production deployment verification

1. Confirm the Amplify app exists and the production branch is `main`.
2. Confirm the latest Amplify branch job matches the merged commit SHA.
3. Confirm the hosted registration page loads from the Amplify production URL.
4. Confirm the GitHub smoke workflow can assume the OIDC role without using static AWS keys.

Observable outcome:

- The hosted app is reachable, the deployed commit is identifiable, and the deploy-time and runtime IAM boundaries remain separate.

## Release gate (phase 9)

1. Run `pnpm exec vitest run tests/aws/infra-phase6-security-hardening.test.ts`.
2. Run `pnpm exec vitest run tests/aws/infra-phase7-ops-verification.test.ts`.
3. Run `pnpm exec vitest run tests/aws/infra-phase8-deferred-vpc-elimination.test.ts`.
4. Run `terraform -chdir=infra validate` and confirm no address mismatch in `imports.tf` targets.
5. Confirm the rollback path in `docs/aws-operator-runbook.md` is still valid for the current environment.

Observable outcome:

- Security controls, operator checks, and deferred-architecture constraints are all verified before promoting changes.
