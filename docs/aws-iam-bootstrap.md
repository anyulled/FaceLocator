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

## GitHub Actions OIDC trust

- GitHub Actions should assume a dedicated OIDC role rather than using long-lived AWS access keys.
- The repository secret `AWS_ROLE_TO_ASSUME` should point at the GitHub Actions role ARN.
- The trust policy should restrict `token.actions.githubusercontent.com:aud` to `sts.amazonaws.com`.
- The trust policy should restrict `token.actions.githubusercontent.com:sub` to the FaceLocator repository only:
  - `repo:anyulled/FaceLocator:ref:refs/heads/main`
  - `repo:anyulled/FaceLocator:pull_request`

## Amplify runtime trust

- AWS Amplify must use a separate runtime role trusted by the `amplify.amazonaws.com` service principal.
- Do not reuse the GitHub Actions OIDC role for hosted runtime access.
- Do not reuse the Lambda execution roles for the hosted Next.js runtime.

The recommended trust policies and production deployment flow are documented in [docs/aws-amplify-deployment.md](/Users/anyulled/IdeaProjects/FaceLocator/docs/aws-amplify-deployment.md).
