# ADR-0008: Defer Full VPC Elimination Until Data Access Changes

## Status

Accepted

## Date

2026-04-27

## Context

The original simplification goal emphasized minimizing VPC usage and reducing cost from private networking.

Phases 1-7 established the actual steady state of this repository:

- Aurora PostgreSQL Serverless v2 remains private
- Lambdas use direct PostgreSQL client connections
- Lambda VPC attachment and interface endpoints are still required for this model

Without recording that conclusion clearly, future changes risk repeating the same invalid optimization path.

## Decision Drivers

- Prevent architectural drift back toward unsupported partial optimizations.
- Make the remaining cost/performance trade-off explicit.
- Leave a clear entry point for any future redesign.

## Considered Options

### Option 1: Keep the current conclusion implicit

- Pros: no further documentation work.
- Cons: future contributors may reattempt incompatible VPC removal changes.

### Option 2: Record full VPC elimination as deferred pending data-access redesign (selected)

- Pros: preserves clarity, sets a clean future decision boundary.
- Cons: does not reduce cost immediately.

## Decision

Defer full VPC elimination until the system no longer depends on direct PostgreSQL socket connectivity from Lambda functions to the private Aurora cluster.

## Consequences

### Positive

- The current architecture and its constraints are explicit.
- Future work can target the real dependency boundary rather than repeating partial networking changes.

### Negative

- Remaining interface endpoint and Lambda VPC costs stay in place for now.

## Implementation Notes

- Updated `README.md` with a deferred-optimization section.
- Updated `docs/aws-database-boundary.md` with the explicit follow-up path.
- Updated `docs/aws-poc-scope.md` to mark unsupported VPC removal as out of scope.
- Added a contract test to keep this decision visible.

## Verification

- `pnpm exec vitest run tests/aws/infra-phase8-deferred-vpc-elimination.test.ts`
- `pnpm lint:markdown`

## Related

- [adr/ADR-0002-explicit-lambda-vpc-attachment.md](adr/ADR-0002-explicit-lambda-vpc-attachment.md)
- [adr/ADR-0003-endpoint-sg-consolidation.md](adr/ADR-0003-endpoint-sg-consolidation.md)
- [docs/aws-database-boundary.md](docs/aws-database-boundary.md)
- [docs/aws-poc-scope.md](docs/aws-poc-scope.md)
- [README.md](README.md)
