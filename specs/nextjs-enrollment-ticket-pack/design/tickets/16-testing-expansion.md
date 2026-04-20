# Ticket 16 — Testing Expansion

## Objective
Expand the test suite beyond the scaffold minimum.

## Required coverage
- validation normalization and rejection
- state machine transitions
- route contracts
- component behavior
- duplicate submission behavior
- retry behavior across register/upload/complete/status flow

## Acceptance criteria
- Tests avoid real AWS.
- JSON response shapes are asserted.
- Visible UX states are asserted.
