# Ticket 09 — Duplicate Attendee Policy

## Objective
Define identity semantics for repeated registrations within the same event.

## Policy
- Same normalized email within the same event should resolve to a stable attendee identity.
- Repeated incomplete attempts may be reused or replaced.
- Successful enrollments must not create duplicate attendee identities.

## Acceptance criteria
- Repository logic enforces the policy.
- Tests cover repeated registration with same email.
