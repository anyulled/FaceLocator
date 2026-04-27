# ADR-0004: Remove Singleton Count And Index Patterns In Infra

## Status

Accepted

## Date

2026-04-27

## Context

After establishing the private Aurora baseline and explicit Lambda VPC attachment in earlier phases, several Terraform resources still used singleton `count = 1` plus `[0]` indexing.

Those patterns were legacy artifacts from feature-flag style networking transitions and made the configuration harder to read and maintain.

## Decision Drivers

- Improve Terraform readability and maintainability.
- Reduce indexing mistakes on singleton resources.
- Keep runtime architecture unchanged while simplifying code.
- Preserve deterministic resource addresses where possible.

## Considered Options

### Option 1: Keep singleton count/index patterns

- Pros: No refactor effort.
- Cons: Ongoing readability and maintenance overhead.

### Option 2: Remove singleton patterns and use direct resource references (selected)

- Pros: Cleaner Terraform, easier to review, fewer indexing hazards.
- Cons: Requires a one-time refactor across references.

### Option 3: Reintroduce conditional toggles for future migration phases

- Pros: Flexible toggling.
- Cons: Reintroduces complexity already removed in prior phases.

## Decision

Remove singleton `count = 1` wrappers and `[0]` indexing for always-on networking resources and update all references to direct resource attributes.

## Consequences

### Positive

- Simpler Terraform graph and references.
- Easier code review and troubleshooting.
- Better alignment with the now-stable private Aurora architecture.

### Negative

- No direct cost reduction from this phase alone.

## Implementation Notes

- Removed singleton `count = 1` from:
  - `aws_route_table.db_private`
  - `aws_security_group.lambda_runtime`
  - interface/gateway endpoint resources in `infra/database.tf`
- Replaced `[0]` indexing with direct references:
  - `aws_security_group.lambda_runtime.id`
  - `aws_route_table.db_private.id`
- Updated Lambda `vpc_config` references to use direct SG id.
- Added Phase 4 infrastructure contract tests.

## Verification

- `pnpm exec vitest run tests/aws/infra-phase4-singleton-resource-cleanup.test.ts`
- `terraform -chdir=infra validate`

## Related

- [adr/ADR-0001-aurora-serverless-phase1.md](adr/ADR-0001-aurora-serverless-phase1.md)
- [adr/ADR-0002-explicit-lambda-vpc-attachment.md](adr/ADR-0002-explicit-lambda-vpc-attachment.md)
- [adr/ADR-0003-endpoint-sg-consolidation.md](adr/ADR-0003-endpoint-sg-consolidation.md)
- [infra/database.tf](infra/database.tf)
- [infra/lambda.tf](infra/lambda.tf)
