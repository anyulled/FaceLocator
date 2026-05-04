# ADR-0001: Defer Aurora And Keep Public RDS During Free Tier

## Status

Accepted

## Date

2026-05-04

## Context

An Aurora migration was attempted but postponed because Aurora is outside the AWS free tier the POC is currently using. The repo must reflect the intentionally simpler interim baseline instead of continuing to describe the abandoned migration as current state.

The interim baseline keeps the Option B networking model:

- Lambdas are non-VPC.
- The RDS PostgreSQL endpoint is publicly reachable.
- PostgreSQL ingress is constrained to explicit narrow CIDR allowlists.
- The hosted Next.js runtime talks directly to PostgreSQL instead of invoking Lambda proxy hops for ordinary reads/writes.

## Decision Drivers

- Stay inside the AWS free-tier boundary until the migration window opens.
- Keep the topology simple and explicit instead of layering Lambda DB proxies over a public database.
- Preserve compatibility with existing PostgreSQL client code paths.
- Keep security posture explicit through CIDR guardrails and direct-runtime IAM.

## Decision

Keep public single-instance RDS PostgreSQL as the active baseline until the free tier is no longer a constraint. The hosted Next.js runtime reads/writes PostgreSQL directly through Secrets Manager, and Lambdas remain only for true worker boundaries.

## Consequences

### Positive

- Keeps the POC on the free-tier-friendly database option for now.
- Removes Lambda-as-DB-proxy operational overhead from the hosted runtime.
- Keeps Terraform and runtime behavior aligned with the real deployed shape.

### Negative

- Publicly reachable endpoint requires strict ingress hygiene.
- Eventual Aurora/private-network migration remains deferred work and must be revisited later.

## Guardrails

- `database_allowed_cidr_blocks` must be non-empty.
- `/0` CIDR ranges are rejected by Terraform validation unless the emergency override is explicitly enabled.
- CI contract tests enforce Option B topology invariants.

## Verification

- `terraform -chdir=infra validate`
- `terraform -chdir=infra plan`
- `pnpm exec vitest run tests/aws/infra-database-phase1.test.ts`
- `pnpm exec vitest run tests/aws/infra-option-b-guardrails.test.ts`

## Related

- `docs/aws-database-boundary.md`
- `docs/aws-operator-runbook.md`
- `infra/database.tf`
- `infra/variables.tf`
