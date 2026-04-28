# ADR-0004: Remove Singleton Count And Index Patterns In Infra

## Status

Accepted

## Date

2026-04-27

## Context

After removing VPC-only architecture dependencies, singleton `count = 1` and `[0]` references were unnecessary and error-prone.

## Decision

Use direct resource references for always-on resources and keep Terraform expressions free of singleton index indirection.

## Consequences

- Cleaner and safer Terraform expressions.
- Lower review/debug overhead.

## Verification

- `pnpm exec vitest run tests/aws/infra-phase4-singleton-resource-cleanup.test.ts`
- `terraform -chdir=infra validate`
