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

## Lambda packaging

- Both Lambda workers live under `lambdas/`.
- Packaging installs runtime dependencies locally in each Lambda directory and writes zip artifacts to `build/lambdas/`.
- Re-run packaging whenever Lambda source changes before applying Terraform.

## Logs and inspection

- Selfie worker log group: `/aws/lambda/<project>-<env>-selfie-enrollment`
- Event-photo worker log group: `/aws/lambda/<project>-<env>-event-photo-worker`
- Inspect bucket objects with `aws s3 ls s3://<bucket>/events/<eventId>/`.

## Data removal

- Review [docs/aws-retention-and-delete.md](/Users/anyulled/IdeaProjects/FaceLocator/docs/aws-retention-and-delete.md) first.
- Use [scripts/delete-biometric-data.sh](/Users/anyulled/IdeaProjects/FaceLocator/scripts/delete-biometric-data.sh) for the operator-driven placeholder flow.
- Treat `tf-destroy.sh` and delete operations as destructive and double-check bucket names, event ids, and attendee ids before running them.
