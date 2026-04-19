# Ticket 18 — AWS Boundary Substitution Prep

## Objective
Prepare the codebase for later real AWS integration without implementing it yet.

## Requirements
- Keep upload instructions behind `upload-gateway.ts`.
- Ensure route handlers depend on abstractions rather than concrete placeholders.
- Document the replacement points for presigned upload generation and later enrollment processing hooks.

## Acceptance criteria
- The future AWS implementation can be introduced by replacing boundary modules instead of rewriting UI and route logic.
