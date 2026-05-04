# ADR-0008: Finalize Full VPC Elimination For Application Lambdas

## Status

Accepted

## Date

2026-04-27

## Context

Earlier phases documented VPC-elimination as deferred while private-Aurora assumptions were being evaluated.

## Decision

The deferment is closed. The active architecture is Option B:

- Lambdas are non-VPC.
- Interface endpoints are removed from the baseline.
- Public RDS remains reachable with narrow ingress allowlists.

## Consequences

- Lower recurring networking cost.
- Strong requirement for ingress hygiene and CI guardrails.

## Verification

- `pnpm exec vitest run tests/aws/infra-phase8-deferred-vpc-elimination.test.ts`
- `pnpm exec vitest run tests/aws/infra-option-b-guardrails.test.ts`
