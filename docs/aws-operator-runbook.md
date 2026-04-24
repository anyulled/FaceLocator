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

## RDS network migration phases

Use staged migration through `database_network_migration_phase` in `infra/terraform.tfvars`:

1. `legacy` (default): keeps current DB behavior (`default` subnet group + public endpoint) so unrelated Terraform applies do not block.
2. `prepare_private_subnets`: creates explicit private subnets, VPC endpoints required by Lambda workloads (S3, Secrets Manager, Rekognition, SES API), moves Lambdas into those private subnets, and updates the custom DB subnet group to those subnets, but does not move the DB instance yet.
3. `cutover_private_endpoint`: disables public DB endpoint while still on `default` subnet group.
4. `cutover_private_subnet_group` (or `private`): attempts to move the DB instance to the custom private DB subnet group.

Important AWS constraint:

- Existing RDS instances in the `default` DB subnet group can fail `ModifyDBInstance` with `InvalidVPCNetworkStateFault` when switching to another subnet group in the same VPC.
- If this happens, keep `cutover_private_endpoint` (private-only endpoint) as the secure steady state, or perform a replacement migration (snapshot/restore into a new DB instance attached to the target subnet group) and cut over application secrets.

Before phase 3, ensure all DB clients (Lambdas/app/ops access) can reach the DB through private networking.

Example `infra/terraform.tfvars` fragment:

```hcl
database_network_migration_phase = "prepare_private_subnets"
database_private_subnets = [
  { availability_zone = "eu-west-1a", cidr_block = "172.31.200.0/24" },
  { availability_zone = "eu-west-1b", cidr_block = "172.31.201.0/24" }
]
```

## Lambda packaging

- Both Lambda workers live under `lambdas/`.
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

## Logs and inspection

- Selfie worker log group: `/aws/lambda/<project>-<env>-selfie-enrollment`
- Attendee registration log group: `/aws/lambda/<project>-<env>-attendee-registration`
- Event-photo worker log group: `/aws/lambda/<project>-<env>-event-photo-worker`
- Matched-photo notifier log group: `/aws/lambda/<project>-<env>-matched-photo-notifier`
- Inspect bucket objects with `aws s3 ls s3://<bucket>/events/<eventId>/`.
- If magic-link gallery images return 403, compare the direct S3 presigned URL with the `/_next/image` URL. If direct S3 returns `AccessDenied` for the matched-photo-notifier role, apply Terraform so that role has `s3:GetObject` on `events/matched/*`.

## Data removal

- Review [docs/aws-retention-and-delete.md](/Users/anyulled/IdeaProjects/FaceLocator/docs/aws-retention-and-delete.md) first.
- Use [scripts/delete-biometric-data.sh](/Users/anyulled/IdeaProjects/FaceLocator/scripts/delete-biometric-data.sh) for the operator-driven placeholder flow.
- Treat `tf-destroy.sh` and delete operations as destructive and double-check bucket names, event ids, and attendee ids before running them.
