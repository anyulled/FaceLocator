# Ticket 07 — Frontend State Machine

## Objective
Replace ad hoc UI booleans with an explicit state machine.

## States
- IDLE
- VALIDATING
- CREATING_REGISTRATION
- READY_TO_UPLOAD
- UPLOADING
- UPLOAD_CONFIRMED
- PROCESSING
- ENROLLED
- FAILED

## Requirements
- Implement in `lib/attendees/state-machine.ts`.
- Keep transitions explicit and deterministic.
- Make UI messages state-driven.

## Acceptance criteria
- Impossible transitions are not representable or are rejected.
- Tests cover transitions.
