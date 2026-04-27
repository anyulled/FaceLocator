# ADR-0009: Establish Release Gate And Rollback Readiness

## Status

Accepted

## Date

2026-04-27

## Context

After phases 1-8, the architecture and operations baseline are documented, but release promotion still depends on implicit tribal knowledge.

A final phase is needed to make promotion and rollback checks explicit, reproducible, and auditable.

## Decision Drivers

- Reduce deployment risk by requiring explicit pre-promotion checks.
- Make rollback expectations clear for operators.
- Keep release readiness tied to the existing phase contract tests.

## Considered Options

### Option 1: Keep release gating informal

- Pros: no additional process.
- Cons: inconsistent readiness decisions and higher rollback friction.

### Option 2: Add explicit release gate and rollback checklist in ops docs (selected)

- Pros: clear operational workflow; easier handoff and incident response.
- Cons: requires docs upkeep as infrastructure evolves.

## Decision

Adopt a Phase 9 release gate that requires running phase security/ops/deferred-architecture tests and confirming rollback readiness before promotion.

## Consequences

### Positive

- Promotion decisions are traceable and repeatable.
- Rollback path is explicit in operator documentation.
- Existing phase contract tests become release controls, not just implementation checks.

### Negative

- Slightly longer release checklist execution time.

## Implementation Notes

- Updated `docs/aws-verification-checklist.md` with a Phase 9 release gate section.
- Updated `docs/aws-operator-runbook.md` with rollback quick-path steps.
- Added a Phase 9 contract test to ensure docs remain aligned.

## Verification

- `pnpm exec vitest run tests/aws/infra-phase9-release-gate.test.ts`
- `pnpm lint:markdown`

## Related

- [adr/ADR-0006-security-hardening-and-cost-guardrail.md](adr/ADR-0006-security-hardening-and-cost-guardrail.md)
- [adr/ADR-0007-operationalize-phase6-controls.md](adr/ADR-0007-operationalize-phase6-controls.md)
- [adr/ADR-0008-defer-full-vpc-elimination.md](adr/ADR-0008-defer-full-vpc-elimination.md)
- [docs/aws-verification-checklist.md](docs/aws-verification-checklist.md)
- [docs/aws-operator-runbook.md](docs/aws-operator-runbook.md)
