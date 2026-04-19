# Ticket 17 — Persistence Hardening

## Objective
Prepare a clean swap from in-memory mocks to real persistence.

## Requirements
- Keep repository contracts narrow and explicit.
- Separate domain operations from storage representation.
- Avoid framework-specific persistence leakage into route handlers.

## Acceptance criteria
- Replacing the in-memory store with a database implementation requires minimal edits outside the repository boundary.
