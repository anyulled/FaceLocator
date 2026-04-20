# T19 — Make an explicit encryption choice

## Objective
Choose and implement the minimal acceptable encryption strategy for the POC.

## Options
- SSE-S3 for lower operational overhead
- SSE-KMS if tighter key control is required from the beginning

## Requirements
- document the choice and rationale
- apply the choice consistently to both buckets
- align secret storage with Secrets Manager encryption defaults

## Acceptance criteria
- encryption is not left as an accidental default without explanation
- Terraform reflects the chosen strategy
