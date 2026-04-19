# FaceLocator Enrollment Scaffold

This repository now hosts the phase `00` scaffold for the attendee enrollment slice described in [nextjs-enrollment-ticket-pack/design/README.md](/Users/anyulled/IdeaProjects/FaceLocator/nextjs-enrollment-ticket-pack/design/README.md).

The runtime app lives at the repository root and the design pack remains in `nextjs-enrollment-ticket-pack/design` as product and implementation guidance.

## Local development

Install dependencies and start the Next.js App Router app:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), then visit `/events/speaker-session-2026/register` to exercise the scaffolded enrollment flow.

## Included in phase 0

- Server-rendered event registration page shell
- Client enrollment form with selfie preview and mocked submission flow
- Route handlers for register, complete, and status
- Shared attendee contracts, validation helpers, state machine skeleton, repository, upload gateway, telemetry stub, and error helpers
- Minimal automated tests for schemas, state transitions, and route JSON shapes

## Placeholder boundaries

- `lib/attendees/upload-gateway.ts` is the future presigned-upload replacement point.
- `lib/attendees/repository.ts` is the current in-memory persistence seam.
- `lib/attendees/telemetry.ts` is a no-op placeholder for future analytics wiring.

## Commands

```bash
pnpm dev
pnpm lint
pnpm test
pnpm build
```

## Next tickets

This scaffold is intentionally narrow and mock-backed. Follow the design pack in ticket order for contracts, page hardening, client UX, routes, idempotency, logging, telemetry, persistence, and AWS boundary substitution.
