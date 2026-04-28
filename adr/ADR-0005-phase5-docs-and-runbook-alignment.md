# ADR-0005: Align Docs And Runbook To Option B Baseline

## Status

Accepted

## Date

2026-04-27

## Context

Architecture and cost controls are only durable if docs/runbooks reflect the active topology.

## Decision

All operator docs must describe Option B as the active baseline:

- non-VPC Lambdas
- public Aurora endpoint
- narrow explicit CIDR ingress policy
- Terraform-first rollback and drift checks

## Verification

- `pnpm lint:markdown`
- `bash -n runbook.sh`
