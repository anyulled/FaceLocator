# Ticket 23 — Confirmation View Refreshability

## Objective
Allow the user to refresh the confirmation state without resubmitting.

## Requirements
- Preserve `registrationId` in a safe navigable way after submission.
- Render status view from that identifier on refresh.

## Acceptance criteria
- A page refresh after upload does not return the user to a blank form-only dead end.
