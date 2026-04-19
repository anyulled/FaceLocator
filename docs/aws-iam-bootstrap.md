# AWS IAM Bootstrap and Root Avoidance

## Non-negotiable rule

Do not use the AWS root user for daily development, Terraform applies, Lambda inspection, or data operations.

## Operator identity

- Create a named IAM user or, preferably, assume a named operator role dedicated to Terraform work.
- The operator identity may be broad enough to provision the POC resources, but runtime identities must stay narrow.
- The Terraform-managed runtime roles in `infra/iam.tf` do not use `Action: *` with `Resource: *`.

## Runtime separation

- `nextjs_presign_policy_arn` is the narrow S3 upload policy for the Next.js backend runtime.
- `aws_iam_role.selfie_enrollment_lambda` is limited to selfie object reads, Rekognition indexing, Secrets Manager, and CloudWatch logs.
- `aws_iam_role.event_photo_worker_lambda` is limited to event-photo reads, optional Rekognition search, Secrets Manager, and CloudWatch logs.

## Deployer expectations

- Export `AWS_PROFILE=<named-operator-profile>` before running Terraform scripts.
- Use `scripts/tf-init.sh` and `scripts/tf-apply.sh` rather than root credentials or ad hoc console clicks.
