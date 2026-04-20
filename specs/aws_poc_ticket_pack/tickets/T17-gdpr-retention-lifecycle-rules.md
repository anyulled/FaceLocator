# T17 — Implement baseline retention controls

## Objective
Apply storage-limitation rules in the POC.

## Required policy decisions
- selfies have an explicit retention window
- unmatched event photos are deleted after 2 days if not otherwise needed
- any derived face crops or temporary processing artifacts have a short retention window

## Infrastructure requirements
- use S3 lifecycle rules where feasible
- where lifecycle cannot express business semantics alone, document the compensating deletion mechanism

## Acceptance criteria
- Terraform includes lifecycle configuration where applicable
- retention policy is documented in the repo
- 2-day unmatched event-photo rule is explicit
