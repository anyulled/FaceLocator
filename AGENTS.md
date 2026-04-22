# FaceLocator Agent Guide

This repository is a POC with a narrow production boundary. Future agents should optimize for correctness, minimal blast radius, and fast verification.

## Operating Rules

- Start with `git status --short --branch` and confirm the current branch before editing.
- Do not revert user changes unless explicitly asked.
- Use `apply_patch` for edits.
- Prefer `rg` / `rg --files` for discovery.
- Keep changes small and traceable. If a fix spans app, lambda, and Terraform, update all three together or do not merge the partial change.
- Ignore `.codex/` and other local workspace artifacts. They are not part of the product repo.

## Current Architecture

- The public app is Next.js hosted on Amplify.
- Postgres/RDS is private.
- Admin reads go through `app/api/admin/events/*`, not directly from server components to the repository.
- The hosted Next.js runtime invokes the `face-locator-poc-admin-events-read` Lambda for admin reads.
- The Amplify compute role must have `lambda:InvokeFunction` on that Lambda.
- The Lambda runs inside the VPC and connects to RDS with the database secret.
- Admin write paths still exist in the app/repository layer and should be changed deliberately, not by accident.

## Hard Lessons From Production

- A 5xx on the admin events page can happen before the Lambda runs if the Amplify runtime role lacks invoke permission.
- A successful Lambda invocation can still fail if the live DB schema is behind the app contract.
- Error handling alone does not fix a missing permission or a schema mismatch.
- Terraform validation is not enough. Verify the actual hosted path.

## What To Check First When Admin Events Fail

1. Check the runtime role IAM permission.
   - Confirm `face-locator-amplify-compute` has `lambda:InvokeFunction` for `face-locator-poc-admin-events-read`.
2. Check the Lambda actually exists and is up to date.
   - Use `terraform output admin_events_read_lambda_name`.
   - Inspect CloudWatch logs for `face-locator-poc-admin-events-read`.
3. Check the admin schema contract.
   - The schema guard lives in `lib/admin/events/schema.ts`.
   - The admin events table must support the columns used by the repository and Lambda.
4. Check the route handler logs.
   - `app/api/admin/events/route.ts`
   - `app/api/admin/events/[eventSlug]/photos/route.ts`
5. Only after the above, inspect RDS connectivity and Secrets Manager.

## Schema Contract

- `lib/admin/events/schema.ts` is the source of truth for admin-events schema bootstrapping.
- If you add a column used by admin reads, add it there.
- If you change the admin event query shape, update:
  - `lib/admin/events/repository.ts`
  - `lambdas/admin-read/index.js`
  - tests under `tests/admin/`
- Treat schema drift as a production risk, not a test-only concern.

## Admin Read Flow

Expected path:

`app/admin/...` -> internal `/api/admin/...` route -> admin read Lambda -> RDS

Key files:

- `app/admin/events/page.tsx`
- `app/admin/events/[eventSlug]/photos/page.tsx`
- `app/api/admin/events/route.ts`
- `app/api/admin/events/[eventSlug]/photos/route.ts`
- `lib/admin/events/backend.ts`
- `lib/admin/events/http.ts`
- `lambdas/admin-read/index.js`

If you change this flow, update the docs and the runbook at the same time.

## Terraform Expectations

- Keep the DB private unless the user explicitly asks otherwise.
- The admin read Lambda should stay small and VPC-attached.
- The Amplify runtime role needs an explicit invoke policy for the admin read Lambda.
- The minimal Terraform touchpoints are:
  - `infra/lambda.tf`
  - `infra/iam.tf`
  - `infra/locals.tf`
  - `infra/variables.tf`
  - `infra/outputs.tf`
  - `infra/terraform.tfvars`

If the plan adds broad network exposure, stop and reconsider.

## Verification Checklist

Run the smallest relevant checks first, then the full set if the change is infrastructure or routing related.

- `pnpm exec vitest run tests/admin/admin-api-auth-delete.test.ts`
- `pnpm exec vitest run`
- `pnpm exec tsc --noEmit`
- `terraform -chdir=infra validate`
- `terraform -chdir=infra plan`

When touching Lambda packaging:

- `bash scripts/package-lambdas.sh`

When touching the hosted admin flow:

- Verify the production Amplify branch/job, not only local tests.
- Confirm logs for the exact request id or correlation id reported to the user.

## Troubleshooting Pattern

Use this order:

1. Permission failure
   - The Lambda is not invoked.
   - Look for IAM deny on `lambda:InvokeFunction`.
2. Invocation failure
   - The Lambda is invoked but fails before DB access.
   - Inspect Lambda logs and packaging.
3. Schema failure
   - The Lambda reaches DB but the query shape is wrong.
   - Confirm schema guard and current columns.
4. Connectivity failure
   - The Lambda cannot reach private RDS or Secrets Manager.
   - Check VPC config, security groups, subnet routing, and secret access.

Do not start at step 4. That was the wrong ordering previously.

## Working With Logs

- Prefer structured `console.error(JSON.stringify(...))` logs for API and Lambda failures.
- Include:
  - scope
  - request path
  - request id / correlation id
  - operation
  - backend mode
  - status code
  - troubleshooting hint
- Do not hide the underlying error. Summarize it and preserve the raw error object when possible.

## Packaging And Runbook

- `scripts/package-lambdas.sh` packages all Lambda zips.
- `runbook.sh` is a local operator script and should stay in sync with:
  - the admin read Lambda name
  - the database secret contract
  - the production Amplify setup
- Keep the runbook current when you change the admin path or Terraform outputs.

## Avoid

- Do not introduce a new cache or queue unless the user asks for it.
- Do not add API Gateway, DynamoDB, Redis, or public RDS as an implicit fix.
- Do not replace a permission problem with a schema workaround.
- Do not assume the Lambda failed if the hosted runtime role never had invoke permission.

## If You Need To Change The Admin Boundary

Make sure the following stay aligned:

- `lib/admin/events/backend.ts`
- `lib/admin/events/http.ts`
- `lib/admin/events/repository.ts`
- `lambdas/admin-read/index.js`
- `infra/iam.tf`
- `infra/lambda.tf`
- `docs/aws-amplify-deployment.md`
- `runbook.sh`

If they do not agree with each other, the repo is in an inconsistent state.
