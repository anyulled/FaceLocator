# AWS Amplify Production Deployment

This document fixes the production hosting contract for the FaceLocator Next.js app. GitHub Actions remains the merge gate, and AWS Amplify Hosting builds and serves the `main` branch as the single production environment.

## Deployment model

- GitHub pull requests run CI and live AWS-backed E2E before merge.
- Branch protection on `main` should require the GitHub checks created in `.github/workflows/`.
- AWS Amplify is connected directly to `anyulled/FaceLocator`.
- Only the `main` branch is mapped as the production branch.
- Production deploys are triggered by Amplify branch auto-builds after a merge lands on `main`.
- GitHub does not start a second build job. Post-merge automation is limited to waiting for Amplify and running a production smoke check.

## Root build manifest

Amplify reads [amplify.yml](/Users/anyulled/IdeaProjects/FaceLocator/amplify.yml) from the repository root and runs:

- `pnpm install --frozen-lockfile`
- `pnpm build`

The build cache keeps:

- pnpm store files
- `node_modules`
- `.next/cache`

## Required Amplify environment variables

Set these on the Amplify app or production branch:

- `AWS_REGION`
- `FACE_LOCATOR_AWS_UPLOAD_MODE=aws`
- `FACE_LOCATOR_REPOSITORY_TYPE=postgres`
- `FACE_LOCATOR_SELFIES_BUCKET`
- `FACE_LOCATOR_EVENT_PHOTOS_BUCKET`
- `FACE_LOCATOR_EVENT_LOGOS_BUCKET`
- `FACE_LOCATOR_MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME` or `MATCHED_PHOTO_NOTIFIER_LAMBDA_NAME`
- `FACE_LOCATOR_EVENT_PHOTO_WORKER_LAMBDA_NAME` or `EVENT_PHOTO_WORKER_LAMBDA_NAME`
- `DATABASE_SECRET_NAME` or `FACE_LOCATOR_DATABASE_SECRET_NAME`
- `MATCH_LINK_SIGNING_SECRET`

The hosted runtime now serves public registration, admin reads, and gallery/unsubscribe flows directly from the public RDS boundary. Request-time Lambda mode has been removed. Lambda invocation remains only for background worker actions such as manual photo matching and manual/scheduled notifications.

Operational baseline:

- Database is public single-instance RDS PostgreSQL for the remainder of the free-tier window.
- RDS ingress must stay on narrow explicit CIDR allowlists.
- Application Lambdas are non-VPC.
- Hosted Next.js runtime connects directly to the database through Secrets Manager.
- Amplify runtime should not depend on Lambda DB-proxy hops for ordinary app traffic.

### Per-tenant Cognito admin variables (runbook)

For each tenant/environment, set these exact variables in Amplify so `/admin/*` and `/api/admin/*` can validate Cognito JWTs:

- `COGNITO_USER_POOL_ID=<tenant_user_pool_id>`
- `COGNITO_APP_CLIENT_ID=<tenant_app_client_id>`
- `COGNITO_ISSUER=https://cognito-idp.<aws-region>.amazonaws.com/<tenant_user_pool_id>`
- Cognito callback URLs must include both `/api/admin/callback` and `/api/admin/token-callback` when the macOS uploader is enabled.

Recommended source of truth:

- Run `terraform -chdir=infra output` and copy:
  - `cognito_user_pool_id`
  - `cognito_user_pool_client_id`
  - `cognito_user_pool_issuer`

Example (eu-west-1):

```bash
COGNITO_USER_POOL_ID=eu-west-1_AbCdEf123
COGNITO_APP_CLIENT_ID=4h1exampleclientid9abc
COGNITO_ISSUER=https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_AbCdEf123
```

## GitHub Actions OIDC role

`AWS_ROLE_TO_ASSUME` must point to the GitHub Actions OIDC role, not the Amplify runtime role.

Recommended role name:

- `face-locator-github-actions`

Recommended trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": [
            "repo:anyulled/FaceLocator:ref:refs/heads/main",
            "repo:anyulled/FaceLocator:pull_request"
          ]
        }
      }
    }
  ]
}
```

This role should include the current CI and live-E2E AWS permissions, plus read-only Amplify inspection if post-merge smoke checks poll build status:

- `amplify:GetApp`
- `amplify:GetBranch`
- `amplify:GetJob`
- `amplify:ListJobs`

Keep Terraform apply out of this role.

## Amplify runtime role

Amplify must use a separate runtime role trusted by the Amplify service. Do not reuse Lambda roles or the GitHub Actions OIDC role.

Recommended role name:

- `face-locator-amplify-compute`

Recommended trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "amplify.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

This role needs:

- `secretsmanager:GetSecretValue` on the database secret used by the hosted app
- `s3:GetObject` on event photos needed for preview and gallery presigning
- S3 permissions required by the Next.js presign boundary for uploads
- `lambda:InvokeFunction` on the event photo worker Lambda for manual photo matching
- `lambda:InvokeFunction` on the matched photo notifier Lambda
- any KMS permissions only if the selected secret or bucket policy requires a customer-managed key

Terraform exports the policy ARNs as `nextjs_presign_policy_arn`, `nextjs_runtime_data_access_policy_arn`, `nextjs_event_photo_worker_invoke_policy_arn`, and `nextjs_matched_photo_notifier_invoke_policy_arn`; attach those policies to the Amplify compute role.

## GitHub repository configuration

Configure these repository-level values:

- Secret: `AWS_ROLE_TO_ASSUME=arn:aws:iam::722851018992:role/face-locator-github-actions`
- Secret: `MATCH_LINK_SIGNING_SECRET=<same signing secret used by the app/lambdas>`
- Secret: `E2E_ADMIN_AUTH_SECRET=<random secret used only by Playwright admin tests>`
- Secret: `FACE_LOCATOR_DATABASE_SECRET_ARN` or variable `FACE_LOCATOR_DATABASE_SECRET_NAME`
- Variable: `AWS_REGION=eu-west-1`
- Variable: `FACE_LOCATOR_SELFIES_BUCKET=face-locator-poc-selfies`
- Variable: `FACE_LOCATOR_EVENT_PHOTOS_BUCKET=face-locator-poc-event-photos`
- Variable: `FACE_LOCATOR_EVENT_LOGOS_BUCKET=face-locator-poc-event-logos`
- Variable: `FACE_LOCATOR_E2E_ADMIN_AUTH=1` is set by the live E2E workflow, not in Amplify production.
- Variable: `AMPLIFY_APP_ID=<app-id>`
- Variable: `AMPLIFY_PRODUCTION_BRANCH=main`

The live E2E workflow runs `pnpm test:e2e:live`, which exercises the web app only. It covers the
landing page, attendee enrollment, event-photo matching, matched gallery, unsubscribe, and seeded
admin-session browser flow. Missing live prerequisites fail the workflow instead of skipping.

## Post-merge production smoke verification

The post-merge workflow in `.github/workflows/amplify-production-smoke.yml`:

- assumes the GitHub OIDC role
- waits for the latest Amplify `main` branch job to finish
- resolves the production branch URL from Amplify
- runs Playwright against the hosted site using `PLAYWRIGHT_BASE_URL`

The hosted smoke suite is intentionally narrow. It verifies that the production registration page renders without starting a local Next.js server.
