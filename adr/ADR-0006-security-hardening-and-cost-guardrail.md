# ADR-0006: Security Hardening And Cost Guardrail Baseline

## Status

Accepted

## Date

2026-04-27

## Context

After phases 1-5, infrastructure and documentation were aligned to a private Aurora + VPC-attached Lambda baseline.

The remaining high-impact hardening actions were:

- enable Cognito MFA at least optionally for admin access
- stop disabling TLS certificate validation in Lambda database clients
- add proactive monthly cost alerts

## Decision Drivers

- Reduce avoidable security risk in admin authentication.
- Enforce TLS verification for database connectivity.
- Detect cost drift early with automated alerts.
- Keep changes small and compatible with the current architecture.

## Considered Options

### Option 1: Keep current state

- Pros: no immediate change risk.
- Cons: leaves MFA disabled, weakens transport security, and provides no spend guardrail.

### Option 2: Apply targeted hardening now (selected)

- Pros: direct security/cost improvements with low implementation complexity.
- Cons: MFA onboarding and budget email configuration require operator follow-through.

### Option 3: Defer to a later platform-security initiative

- Pros: bundles work into a larger program.
- Cons: prolongs known risks.

## Decision

Implement phase 6 with three concrete controls:

1. Set Cognito `mfa_configuration` to `OPTIONAL`.
2. Replace `ssl: { rejectUnauthorized: false }` with `ssl: true` in all DB-using Lambda functions.
3. Add a Terraform-managed monthly AWS budget alarm with forecasted and actual email notifications.

## Consequences

### Positive

- Admin users can enroll MFA without forcing disruptive migration.
- Lambda DB clients no longer bypass certificate validation.
- Operators receive budget alerts before and at budget overrun.

### Negative

- Budget alarms depend on a valid notification email.
- MFA remains optional (not enforced) and may require a later step to become required.

## Implementation Notes

- Updated Cognito user pool in `infra/cognito.tf`.
- Updated TLS settings in:
  - `lambdas/admin-read/index.js`
  - `lambdas/attendee-registration/index.js`
  - `lambdas/selfie-enrollment/index.js`
  - `lambdas/event-photo-worker/index.js`
  - `lambdas/matched-photo-notifier/index.js`
- Added `infra/budgets.tf` with monthly budget resource.
- Added budget-related Terraform variables and tfvars entries.

## Verification

- `pnpm exec vitest run tests/aws/infra-phase6-security-hardening.test.ts`
- `terraform -chdir=infra validate`

## Related

- [adr/ADR-0001-aurora-serverless-phase1.md](adr/ADR-0001-aurora-serverless-phase1.md)
- [adr/ADR-0002-explicit-lambda-vpc-attachment.md](adr/ADR-0002-explicit-lambda-vpc-attachment.md)
- [adr/ADR-0003-endpoint-sg-consolidation.md](adr/ADR-0003-endpoint-sg-consolidation.md)
- [adr/ADR-0004-remove-singleton-count-index-patterns.md](adr/ADR-0004-remove-singleton-count-index-patterns.md)
- [adr/ADR-0005-phase5-docs-and-runbook-alignment.md](adr/ADR-0005-phase5-docs-and-runbook-alignment.md)
