# Ticket 22 — Rate Limiting Placeholder Policy

## Objective
Define how the route layer will signal throttling even before real infrastructure is added.

## Requirements
- Introduce a placeholder rate-limit decision point in the registration route.
- Return `RATE_LIMITED` with `429` when the placeholder policy is triggered.

## Acceptance criteria
- The rate limiting branch is testable.
- The policy is abstracted for future substitution.
