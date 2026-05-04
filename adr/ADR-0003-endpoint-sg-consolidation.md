# ADR-0003: Remove Interface Endpoint Dependencies Under Option B

## Status

Superseded

## Superseded By

Option B convergence (non-VPC Lambdas + public RDS ingress), implemented 2026-04-28.

## Date

2026-04-27

## Historical Context

This ADR previously described endpoint security group consolidation for a private-subnet Lambda egress model.

## Current Decision

Interface endpoints and endpoint-specific SG ingress rules are not part of the active baseline. Runtime AWS API access uses standard public AWS endpoints.

## Rationale

- Reduces fixed network resource cost.
- Removes endpoint-specific complexity from Terraform.
- Aligns with non-VPC Lambda execution model.

## Drift Prevention

- CI test: `tests/aws/infra-phase3-endpoint-sg-simplification.test.ts`
- Additional topology guardrails: `tests/aws/infra-option-b-guardrails.test.ts`
