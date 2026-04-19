# Next.js Attendee Enrollment Ticket Pack

This bundle contains a scaffold prompt and an ordered backlog of specification tickets for implementing the narrow Next.js attendee enrollment slice.

## Intended workflow

1. Run `00-scaffold-codex-prompt.md` in Codex to generate the baseline feature with mocks.
2. Apply tickets in numerical order.
3. Keep each ticket isolated and reviewable.
4. Do not introduce AWS internals until the dedicated AWS substitution ticket.

## Scope

Included:
- Next.js App Router page shell
- Client enrollment form
- Route Handlers
- Shared contracts and validation
- Mock repository and upload gateway
- Deterministic state machine
- Error model
- Logging, telemetry stubs, tests

Excluded:
- Real AWS SDK integration
- Rekognition
- SES
- Event photo ingestion
- Gallery rendering
- Purchases
- Admin interfaces

## Suggested application order

- 00 scaffold
- 01 contracts and schemas
- 02 page shell
- 03 client form
- 04 registration route
- 05 completion route
- 06 status route
- 07 state machine
- 08 idempotency
- 09 duplicate attendee policy
- 10 error model
- 11 upload orchestration hardening
- 12 polling UX refinement
- 13 accessibility
- 14 logging and correlation ids
- 15 telemetry stubs
- 16 testing expansion
- 17 persistence hardening
- 18 AWS boundary substitution prep
