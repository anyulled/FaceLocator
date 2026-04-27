# ADR-0005: Align Docs And Runbook To Private Aurora Baseline

## Status

Accepted

## Date

2026-04-27

## Context

Phases 1-4 changed the infrastructure baseline to private Aurora Serverless v2 with explicit Lambda VPC attachment and consolidated endpoint security controls.

Several operational documents and the local runbook needed to be aligned so operators and contributors do not follow outdated assumptions.

## Decision Drivers

- Keep operational docs consistent with current Terraform reality.
- Reduce operator error during verification and deployment.
- Make cost and architecture constraints explicit in project-level documentation.

## Considered Options

### Option 1: Leave docs as-is

- Pros: No immediate work.
- Cons: Increases risk of incorrect operator actions.

### Option 2: Update docs and runbook in a dedicated phase (selected)

- Pros: Keeps operational contract synchronized and auditable.
- Cons: No direct runtime behavior changes.

## Decision

Treat phase 5 as a dedicated documentation and runbook synchronization step after infrastructure phases.

## Consequences

### Positive

- README now reflects cost baseline and current architecture constraints.
- Amplify deployment doc clearly states no direct runtime-to-Aurora access.
- Next.js boundary wording reflects private Aurora as baseline.
- Runbook verifies key Terraform outputs before plan/apply.

### Negative

- Requires ongoing maintenance as infrastructure evolves.

## Implementation Notes

- Updated `README.md` with cost baseline section.
- Updated `docs/aws-amplify-deployment.md` with private Aurora operational baseline.
- Updated `docs/aws-nextjs-boundary.md` for baseline wording.
- Updated `runbook.sh` to print and verify critical Terraform outputs.

## Verification

- `pnpm lint:markdown`
- `bash -n runbook.sh`

## Related

- [adr/ADR-0001-aurora-serverless-phase1.md](adr/ADR-0001-aurora-serverless-phase1.md)
- [adr/ADR-0002-explicit-lambda-vpc-attachment.md](adr/ADR-0002-explicit-lambda-vpc-attachment.md)
- [adr/ADR-0003-endpoint-sg-consolidation.md](adr/ADR-0003-endpoint-sg-consolidation.md)
- [adr/ADR-0004-remove-singleton-count-index-patterns.md](adr/ADR-0004-remove-singleton-count-index-patterns.md)
