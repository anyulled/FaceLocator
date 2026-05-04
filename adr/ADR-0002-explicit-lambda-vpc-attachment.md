# ADR-0002: Remove Lambda VPC Attachment For Option B

## Status

Superseded

## Superseded By

Option B convergence (non-VPC Lambdas + public RDS ingress), implemented 2026-04-28.

## Date

2026-04-27

## Historical Context

This ADR previously documented a private-database model that required Lambda VPC attachment for PostgreSQL connectivity.

## Current Decision

Lambda functions must remain non-VPC for the current baseline. Terraform must not define `vpc_config` blocks for application Lambdas in this repository.

## Rationale

- Eliminates recurring VPC networking overhead.
- Keeps function startup and operations simpler.
- Matches the selected public-ingress RDS model.

## Drift Prevention

- CI test: `tests/aws/infra-phase2-lambda-vpc-explicit.test.ts`
- Runbook checks in `docs/aws-operator-runbook.md`
