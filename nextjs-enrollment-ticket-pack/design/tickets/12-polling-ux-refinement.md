# Ticket 12 — Polling UX Refinement

## Objective
Improve post-upload status handling.

## Requirements
- After upload completion, poll registration status on an interval.
- Stop polling on terminal states.
- Surface deterministic copy for processing, enrolled, and failed.
- Make polling easy to replace with push later.

## Acceptance criteria
- Polling interval is centralized.
- Terminal states stop polling.
- Refreshing the confirmation view does not force resubmission.
