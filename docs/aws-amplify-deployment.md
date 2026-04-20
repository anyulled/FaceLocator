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
- `DATABASE_SECRET_NAME` or `FACE_LOCATOR_DATABASE_SECRET_NAME`

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
- S3 permissions required by the Next.js presign boundary for selfie uploads
- any KMS permissions only if the selected secret or bucket policy requires a customer-managed key

## GitHub repository configuration

Configure these repository-level values:

- Secret: `AWS_ROLE_TO_ASSUME=arn:aws:iam::722851018992:role/face-locator-github-actions`
- Variable: `AWS_REGION=eu-west-1`
- Variable: `FACE_LOCATOR_SELFIES_BUCKET=face-locator-poc-selfies`
- Variable: `FACE_LOCATOR_EVENT_PHOTOS_BUCKET=face-locator-poc-event-photos`
- Variable: `AMPLIFY_APP_ID=<app-id>`
- Variable: `AMPLIFY_PRODUCTION_BRANCH=main`

## Post-merge production smoke verification

The post-merge workflow in `.github/workflows/amplify-production-smoke.yml`:

- assumes the GitHub OIDC role
- waits for the latest Amplify `main` branch job to finish
- resolves the production branch URL from Amplify
- runs Playwright against the hosted site using `PLAYWRIGHT_BASE_URL`

The hosted smoke suite is intentionally narrow. It verifies that the production registration page renders without starting a local Next.js server.
