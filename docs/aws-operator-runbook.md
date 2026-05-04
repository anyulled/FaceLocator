# AWS POC Operator Runbook

## Prerequisites

- Terraform `1.14.x`
- AWS CLI authenticated with a named non-root profile
- Node.js and npm for Lambda packaging
- `zip`
- `psql` for schema bootstrap and delete workflow operations

## AWS profile usage

- Export `AWS_PROFILE=<named-operator-profile>`.
- Do not use the AWS root user for deployment, debugging, or data operations.

## Terraform flow

1. Run [scripts/package-lambdas.sh](/Users/anyulled/IdeaProjects/FaceLocator/scripts/package-lambdas.sh).
2. Run [scripts/tf-init.sh](/Users/anyulled/IdeaProjects/FaceLocator/scripts/tf-init.sh).
3. Review and apply with [scripts/tf-apply.sh](/Users/anyulled/IdeaProjects/FaceLocator/scripts/tf-apply.sh).
4. Destroy only when explicitly needed with [scripts/tf-destroy.sh](/Users/anyulled/IdeaProjects/FaceLocator/scripts/tf-destroy.sh).

## Option B rollout sequencing

Apply Option B convergence in two Terraform phases:

1. **Phase 1 (stabilize)**: apply ingress guardrails, output/documentation alignment, and invariant checks without changing runtime traffic paths.
2. **Phase 2 (cleanup)**: remove all remaining in-scope legacy private-network artifacts and finalize Option B-only topology.

Rollback rule:

- Revert to the previous known-good git commit and re-apply Terraform.
- Do not use manual console edits as rollback.

## Database baseline

The POC database baseline is public single-instance RDS PostgreSQL with explicitly narrow ingress CIDRs for the current free-tier window.

- Keep `database_allowed_cidr_blocks` explicit and narrow (prefer `/32` runtime/operator egress IPs).
- Never use `/0` ingress ranges.
- Treat the committed `infra/terraform.tfvars` CIDR as a placeholder until the real runtime/operator egress IPs are confirmed.

Example `infra/terraform.tfvars` fragment:

```hcl
database_allowed_cidr_blocks = ["203.0.113.10/32"]
```

## Lambda packaging

- All Lambda workers live under `lambdas/`.
- Packaging installs runtime dependencies locally in each Lambda directory and writes zip artifacts to `build/lambdas/`.
- Re-run packaging whenever Lambda source changes before applying Terraform.

## Production hosting flow

1. Merge a reviewed pull request into `main`.
2. Let GitHub Actions complete the required checks and post-merge smoke workflow.
3. Let AWS Amplify auto-build the connected `main` branch for production hosting.
4. Inspect the Amplify branch job and hosted production URL if verification fails.

Operational notes:

- GitHub Actions assumes the dedicated OIDC role for CI and hosted smoke verification.
- Amplify Hosting uses its own runtime role for the deployed Next.js server workload.
- Terraform apply remains an operator action and is separate from the hosted deployment path.

## Security and cost baseline

- Cognito admin MFA is configured as `OPTIONAL` and should be enabled for operator accounts.
- Hosted runtime and Lambda PostgreSQL clients now use standard SSL verification and must not revert to `rejectUnauthorized: false`.
- A monthly AWS budget alarm is expected to exist for the POC account scope.
- RDS PostgreSQL log export is intentionally disabled for the POC to avoid unnecessary CloudWatch cost.

## Logs and inspection

- Selfie worker log group: `/aws/lambda/<project>-<env>-selfie-enrollment`
- Attendee registration log group: `/aws/lambda/<project>-<env>-attendee-registration`
- Event-photo worker log group: `/aws/lambda/<project>-<env>-event-photo-worker`
- Matched-photo notifier log group: `/aws/lambda/<project>-<env>-matched-photo-notifier`
- Inspect bucket objects with `aws s3 ls s3://<bucket>/events/<eventId>/`.
- If magic-link gallery images return 403, compare the direct S3 presigned URL with the `/_next/image` URL. If direct S3 returns `AccessDenied`, confirm the Amplify runtime role has the direct event-photo read policy attached.

## Data removal

- Review [docs/aws-retention-and-delete.md](/Users/anyulled/IdeaProjects/FaceLocator/docs/aws-retention-and-delete.md) first.
- Use [scripts/delete-biometric-data.sh](/Users/anyulled/IdeaProjects/FaceLocator/scripts/delete-biometric-data.sh) for the operator-driven placeholder flow.
- Treat `tf-destroy.sh` and delete operations as destructive and double-check bucket names, event ids, and attendee ids before running them.

## Rollback quick path

Use this when a newly applied infrastructure change needs to be reverted quickly:

1. Identify the last known-good commit SHA and Terraform plan context.
2. Check out the known-good commit locally and run `./scripts/package-lambdas.sh`.
3. Run `terraform -chdir=infra validate` and `terraform -chdir=infra plan`.
4. Apply only after confirming the plan reverts the unintended changes.
5. Re-run smoke checks for admin event reads, attendee registration, scheduled photo matching, and the matched-photo notifier schedule.

If state and code diverge unexpectedly, pause and reconcile `infra/imports.tf` targets before applying additional changes.

## Drift-prevention checks

Before each production apply, confirm the Option B invariants:

1. `infra/lambda.tf` contains no `vpc_config` blocks.
2. `infra/database.tf` contains no `aws_vpc_endpoint` resources.
3. `infra/variables.tf` enforces a non-empty `database_allowed_cidr_blocks` allowlist and rejects `/0`.
4. Run:
   - `pnpm exec vitest run tests/aws/infra-phase2-lambda-vpc-explicit.test.ts`
   - `pnpm exec vitest run tests/aws/infra-phase3-endpoint-sg-simplification.test.ts`
   - `pnpm exec vitest run tests/aws/infra-phase8-deferred-vpc-elimination.test.ts`
   - `pnpm exec vitest run tests/aws/infra-option-b-guardrails.test.ts`
