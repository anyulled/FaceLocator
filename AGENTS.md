# FaceLocator Agent Guide

This repository is a POC with a narrow production boundary. Future agents should optimize for correctness, minimal blast radius, and fast verification.

## Operating Rules

- Start with `git status --short --branch` and confirm the current branch before editing.
- Do not revert user changes unless explicitly asked.
- Use `apply_patch` for edits.
- Prefer `rg` / `rg --files` for discovery.
- Do not suggest `aws sso login` as the account does not use SSO. Prefer long-lived IAM keys or environment variables as configured in the environment.
- Keep changes small and traceable. If a fix spans app, lambda, and Terraform, update all three together or do not merge the partial change.
- Keep `.codex/` and other local workspace artifacts out of git. They are not part of the product repo.
- If you change the request flow, backend boundary, or infrastructure shape, update `README.md`, the architecture diagrams, and the matching docs in the same change.

## Spawn Strategy

Use an inverse pyramid: start with the cheapest model that can plausibly do the work, then move up only when the task is genuinely demanding.

### Tier 0: Orchestrator

- Default the main agent to the cheapest available model for coordination, triage, and incremental edits.
- Use this tier for simple changes, ordinary bug fixes, routine refactors, file discovery, and implementation sequencing.
- Keep reasoning effort low unless the task clearly needs deeper synthesis.

### Tier 1: Cheap Specialists

- Spawn one or more cheap models when the work can be isolated by domain, file set, or language.
- Use these agents for narrow implementation slices, local debugging, log inspection, test analysis, and report generation.
- Prefer parallel cheap agents for frontend, backend, desktop, infrastructure, and language-specific subtasks when their outputs do not depend on each other.
- Set reasoning effort to low for straightforward execution and medium only when the subtask has moderate ambiguity.

### Tier 2: Mid-Tier Integration

- Use a stronger model when the task crosses boundaries and requires stitching together multiple domains, but is not yet a full architecture or planning problem.
- This tier is appropriate for integration fixes, contract alignment, cross-file refactors, and troubleshooting where multiple clues must be reconciled.
- Set reasoning effort to medium by default.

### Tier 3: High-Capability Planning

- Reserve the most capable and expensive model for planning, design, optimization, architecture decisions, complex troubleshooting, and tasks with high ambiguity or high blast radius.
- Use it when the cost of a wrong assumption is higher than the cost of the model.
- Set reasoning effort to high or xhigh only for these demanding tasks.

### Verification Agent

- Spawn a verification-focused agent at the end of substantial work to confirm the requirements are met and the solution is practical, minimal, and not overengineered.
- Prefer a cheap or mid-tier model for verification unless the verification itself is complex or architecture-sensitive.
- The verification agent should validate behavior, edge cases, and regression risk, then report any remaining gaps before finalizing.

### Delegation Rules

- Default to cheap models for implementation and troubleshooting orchestration.
- Spawn as many cheap agents as needed when tasks split cleanly across frontend, backend, desktop, infrastructure, or different languages.
- Escalate only the smallest task that actually needs more capability; do not upgrade the whole workflow by default.
- When spawning, set reasoning mode explicitly and conservatively:
  - `low` for bounded execution and narrow investigation
  - `medium` for moderate ambiguity or cross-file coordination
  - `high` or `xhigh` only for hard planning, optimization, or deep debugging
- Keep the central agent in control of sequencing, integration, and final decisions.

## Feature And Specification Intake

- For a new feature, specification, or implementation request, ask clarifying questions until you understand roughly 90% of the needed behavior before editing.
- Clarify the user journey, inputs, outputs, error states, permissions, persistence, deployment target, and verification expectations when they are relevant.
- Prefer a small number of high-signal questions over a long questionnaire. Continue only when the remaining unknowns are low-risk or explicitly accepted by the user.
- Do not fill major product gaps with assumptions. If an assumption is necessary, state it clearly before implementing and keep the design conservative.
- Avoid overengineering. Fit the solution to the confirmed scope and the existing architecture.

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

## Robust Testing Strategy

- **Prefer Integration Over Pure Unit Mocks**: When testing repository or API logic, aim to use a real database connection (managed via `checkLiveE2EPrerequisites`) whenever possible. Only mock the boundary (identity resolution, S3) if a live connection is unavailable or the side effect is destructive.
- **Git Hooks Enforcement**:
  - `pre-commit`: Runs `lint` and `unit tests`. Fast feedback for the developer.
  - `pre-push`: Runs `typecheck`, `lint`, `test` (including integration), and `build`. Mandatory gate before code leaves the local machine.
- **Test File Organization**:
  - `tests/admin/`: Integration and route tests for the admin dashboard.
  - `tests/e2e/`: Playwright browser tests for critical user journeys.
- **Verification First**: Always run the smallest relevant test set before expanding to the full suite.

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

## After Troubleshooting

- After resolving an issue, think through how to prevent the same class of failure from recurring, not only the exact error that was reported.
- Consider adjacent inputs and flows that use the same boundary: different event slugs, browsers, origins, permissions, schemas, buckets, Lambdas, and deployment environments.
- Add or recommend the smallest durable prevention that fits the risk: validation, tests, schema guards, Terraform assertions, runbook updates, clearer logging, or production verification steps.
- Once the root cause is confirmed, add a focused unit test that reproduces the failure mode or the closest deterministic equivalent before closing the issue.
- If prevention requires broader product or infrastructure scope than the immediate fix, call that out explicitly instead of silently expanding the change.
- Include the prevention check in the final report so the user can see whether the fix is narrow, generalized, or intentionally deferred.

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
- While troubleshooting, inspect the current error handling and logging first and look for the smallest improvement that would make the next failure easier to diagnose.
- If the logs are vague, lossy, or missing an important field, prefer a focused logging improvement as part of the fix instead of leaving the ambiguity in place.

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
