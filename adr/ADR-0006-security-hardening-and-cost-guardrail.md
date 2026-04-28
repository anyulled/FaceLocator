# ADR-0006: Security Hardening And Cost Guardrail Baseline

## Status

Accepted

## Date

2026-04-27

## Context

After selecting Option B, hardening and cost controls remain mandatory:

- optional Cognito MFA for admin access
- TLS verification in Lambda database clients
- monthly AWS budget alarm
- explicit CIDR ingress guardrails for public Aurora access

## Decision

Maintain all phase 6 controls and add Terraform ingress validations that enforce non-empty allowlists and reject `/0` ranges.

## Verification

- `pnpm exec vitest run tests/aws/infra-phase6-security-hardening.test.ts`
- `pnpm exec vitest run tests/aws/infra-option-b-guardrails.test.ts`
- `terraform -chdir=infra validate`
