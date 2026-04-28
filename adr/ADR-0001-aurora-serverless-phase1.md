# ADR-0001: Adopt Aurora PostgreSQL Serverless v2 For Phase 1

## Status

Accepted

## Date

2026-04-27

## Context

The POC replaced single-instance RDS with Aurora PostgreSQL Serverless v2 to simplify infrastructure, improve scaling elasticity, and reduce idle cost.

Follow-up convergence selected Option B as the steady-state network model:

- Lambdas are non-VPC.
- Aurora endpoints are publicly reachable.
- PostgreSQL ingress is constrained to explicit narrow CIDR allowlists.

## Decision Drivers

- Reduce recurring VPC and endpoint costs.
- Keep Terraform topology simple and deterministic.
- Preserve compatibility with existing PostgreSQL client code paths.
- Keep security posture explicit through CIDR guardrails.

## Decision

Adopt Aurora PostgreSQL Serverless v2 as the database baseline, with publicly reachable endpoints and explicit narrow ingress CIDRs managed by Terraform.

## Consequences

### Positive

- Cost-efficient ACU scaling model.
- Removal of Lambda VPC attachment and interface endpoint overhead.
- Simpler Terraform graph and easier operations.

### Negative

- Publicly reachable endpoint requires strict ingress hygiene.
- Network exposure risk increases if CIDR policy drifts.

## Guardrails

- `database_allowed_cidr_blocks` must be non-empty.
- `/0` CIDR ranges are rejected by Terraform validation.
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
