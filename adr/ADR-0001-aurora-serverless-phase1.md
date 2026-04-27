# ADR-0001: Adopt Aurora PostgreSQL Serverless v2 For Phase 1

## Status

Accepted

## Date

2026-04-27

## Context

The POC previously relied on a single PostgreSQL RDS instance and a staged network migration variable (`database_network_migration_phase`) to transition from public access to private networking over multiple applies.

That approach created operational complexity and made infrastructure behavior environment-dependent.

For Phase 1, we need a stable baseline that is private by default, aligns with current app/Lambda contracts, and removes the migration-state branching from Terraform.

## Decision Drivers

- Keep database access private by default.
- Remove fragile staged migration states from Terraform.
- Preserve existing Secrets Manager contract (`host`, `port`, `dbname`, `username`, `password`).
- Maintain compatibility with VPC-attached Lambda execution for existing flows.
- Lower idle database cost versus always-on db.t3.micro.

## Considered Options

### Option 1: Keep RDS db.t3.micro with staged migration phases

- Pros: No data model change, minimal Terraform refactor.
- Cons: Keeps migration-phase complexity, keeps always-on cost, keeps historical cutover operational risk.

### Option 2: Replace with Aurora PostgreSQL Serverless v2 (selected)

- Pros: Private baseline, simpler Terraform state model, ACU-based scaling for lower idle cost, clean writer/reader endpoints.
- Cons: Requires replacement migration and data cutover planning.

### Option 3: Keep RDS and hard-cut to private without staged variable

- Pros: Simpler than staged model, less resource replacement than Aurora.
- Cons: Retains always-on cost and single-instance operational limits.

## Decision

Adopt Aurora PostgreSQL Serverless v2 as the Terraform-managed database boundary in Phase 1.

## Rationale

Aurora Serverless v2 provides a cleaner baseline than staged RDS migration while preserving PostgreSQL compatibility and the existing secret contract used by app and Lambda code.

Removing `database_network_migration_phase` eliminates environment drift caused by transitional infrastructure modes.

## Consequences

### Positive

- Database baseline is private and deterministic.
- Terraform no longer carries migration-phase branching.
- Secrets and app contracts remain stable.
- Aurora writer/reader endpoints are available for future read/write split.
- Improved cost elasticity compared with always-on db.t3.micro.

### Negative

- Existing environments need migration planning to move data from RDS to Aurora.
- New Terraform variables are introduced for Aurora tuning.

### Risks

- Engine-version availability varies by region.
- Capacity tuning can affect latency/cost if min/max ACU are poorly chosen.

## Implementation Notes

- Replaced `aws_db_instance.poc` with:
  - `aws_rds_cluster.poc`
  - `aws_rds_cluster_instance.poc`
- Updated secret source to `aws_rds_cluster.poc.endpoint` and `aws_rds_cluster.poc.port`.
- Removed `database_network_migration_phase` variable and output.
- Added Aurora tuning variables:
  - `aurora_postgresql_engine_version`
  - `aurora_serverless_min_capacity`
  - `aurora_serverless_max_capacity`
- Updated docs and runbook for Aurora baseline and private subnet requirements.
- Added infrastructure tests covering resource, variable, output, and documentation contracts.

## Verification

- `terraform -chdir=infra validate`
- `pnpm exec vitest run tests/aws/infra-database-phase1.test.ts`

## Related

- `docs/aws-database-boundary.md`
- `docs/aws-operator-runbook.md`
- `infra/database.tf`
- `infra/secrets.tf`
- `infra/variables.tf`
- `infra/outputs.tf`
