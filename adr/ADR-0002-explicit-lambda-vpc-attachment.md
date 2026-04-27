# ADR-0002: Keep Lambda VPC Attachment Explicit With Private Aurora

## Status

Accepted

## Date

2026-04-27

## Context

Phase 1 established Aurora PostgreSQL Serverless v2 in private subnets as the database baseline.

The original simplification plan had a follow-up step to remove Lambda VPC attachment. During implementation review, we validated that all database clients in this repository use direct PostgreSQL socket connectivity via the pg driver.

Direct connectivity from a Lambda function outside the VPC to a private Aurora endpoint is not possible.

## Decision Drivers

- Preserve working connectivity to private Aurora endpoints.
- Avoid introducing a partial refactor that breaks runtime behavior.
- Remove transitional conditional Terraform branches where they no longer add value.
- Keep topology deterministic for operators.

## Considered Options

### Option 1: Remove Lambda VPC attachment now

- Pros: Lower cold-start overhead.
- Cons: Breaks database connectivity for all Lambda database operations.

### Option 2: Keep Lambda VPC attachment but make it explicit (selected)

- Pros: Maintains working private DB access; removes conditional branching complexity from Terraform.
- Cons: Retains VPC cold-start and networking overhead.

### Option 3: Remove Lambda VPC by migrating all DB access to Aurora Data API

- Pros: Allows Lambdas outside VPC with private database model.
- Cons: Requires significant application and query-layer refactor beyond this phase.

## Decision

Keep Lambda VPC attachment and convert it from conditional dynamic blocks to explicit static `vpc_config` blocks for all five Lambda functions.

## Consequences

### Positive

- Private Aurora connectivity remains functional.
- Terraform intent is clearer and less error-prone.
- Eliminates obsolete `use_lambda_vpc` branching logic.

### Negative

- Lambda ENI cold-start and VPC operational overhead remains.

### Deferred Work

- Evaluate Aurora Data API migration in a future phase if removing Lambda VPC remains a cost/performance objective.

## Implementation Notes

- Removed `use_lambda_vpc` local branching variable.
- Replaced dynamic `vpc_config` blocks with explicit `vpc_config` in:
  - selfie enrollment Lambda
  - attendee registration Lambda
  - admin events read Lambda
  - event photo worker Lambda
  - matched photo notifier Lambda
- Added tests to enforce explicit VPC configuration contract.

## Verification

- `pnpm exec vitest run tests/aws/infra-phase2-lambda-vpc-explicit.test.ts`
- `terraform -chdir=infra validate`

## Related

- [adr/ADR-0001-aurora-serverless-phase1.md](adr/ADR-0001-aurora-serverless-phase1.md)
- [infra/database.tf](infra/database.tf)
- [infra/lambda.tf](infra/lambda.tf)
