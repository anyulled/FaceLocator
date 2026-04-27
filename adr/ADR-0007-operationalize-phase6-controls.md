# ADR-0007: Operationalize Phase 6 Security Controls

## Status

Accepted

## Date

2026-04-27

## Context

Phase 6 introduced three concrete controls:

- optional Cognito MFA for admin authentication
- TLS verification in Lambda PostgreSQL clients
- a monthly AWS budget alarm

Those controls were implemented in code and Terraform, but operators still needed direct verification steps and visible outputs to confirm them during deployment and production checks.

## Decision Drivers

- Make new security controls observable to operators.
- Reduce drift between implemented controls and operational practice.
- Keep verification simple and repeatable with existing tooling.

## Considered Options

### Option 1: Leave verification implicit

- Pros: no further work.
- Cons: operators must infer control presence from source code and Terraform internals.

### Option 2: Add explicit outputs, runbook checks, and verification guidance (selected)

- Pros: makes controls visible and operationally auditable.
- Cons: requires ongoing doc maintenance.

## Decision

Add Phase 7 operator-facing verification for Phase 6 controls by exposing budget outputs, extending the runbook, and updating the verification checklist.

## Consequences

### Positive

- Operators can confirm the monthly budget alarm from Terraform outputs.
- Operators can check current Cognito MFA mode through the runbook.
- Verification docs now include the security and cost guardrail baseline.

### Negative

- Documentation and runbook must stay synchronized with future security changes.

## Implementation Notes

- Added `monthly_cost_budget_name` and `monthly_cost_budget_limit_usd` outputs.
- Added runbook steps for budget output and Cognito MFA checks.
- Updated verification checklist and operator runbook.
- Added a Phase 7 contract test for outputs and docs alignment.

## Verification

- `pnpm exec vitest run tests/aws/infra-phase7-ops-verification.test.ts`
- `terraform -chdir=infra validate`
- `pnpm lint:markdown`
- `bash -n runbook.sh`

## Related

- [adr/ADR-0006-security-hardening-and-cost-guardrail.md](adr/ADR-0006-security-hardening-and-cost-guardrail.md)
- [infra/outputs.tf](infra/outputs.tf)
- [docs/aws-operator-runbook.md](docs/aws-operator-runbook.md)
- [docs/aws-verification-checklist.md](docs/aws-verification-checklist.md)
- [runbook.sh](runbook.sh)
