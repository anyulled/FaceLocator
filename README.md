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

## AWS POC Scope

AWS infrastructure work is tracked separately in [aws_poc_ticket_pack/README.md](/Users/anyulled/IdeaProjects/FaceLocator/aws_poc_ticket_pack/README.md) and begins with an intentionally narrow POC boundary:

- single AWS region
- Terraform-managed infrastructure
- least-privilege IAM with no root-user operational flow
- S3 buckets for selfies and event photos
- Lambda functions for selfie enrollment and event-photo preparation
- Rekognition collection
- PostgreSQL-compatible persistence boundary
- Secrets Manager
- CloudWatch logging
- GDPR lifecycle and deletion controls

The AWS POC explicitly excludes:

- high availability and redundancy work
- sharding or multi-region design
- Step Functions, EventBridge, SQS, WAF, CDN, and broad CI/CD plumbing
- platform hardening that is not directly required by a ticketed need

No AWS resource should be introduced unless it maps directly to a ticket in `aws_poc_ticket_pack`.

## AWS POC Operator Docs

The AWS stream now includes the baseline operator and application boundary documents needed to provision and inspect the POC safely:

- [docs/aws-iam-bootstrap.md](/Users/anyulled/IdeaProjects/FaceLocator/docs/aws-iam-bootstrap.md)
- [docs/aws-database-boundary.md](/Users/anyulled/IdeaProjects/FaceLocator/docs/aws-database-boundary.md)
- [docs/aws-retention-and-delete.md](/Users/anyulled/IdeaProjects/FaceLocator/docs/aws-retention-and-delete.md)
- [docs/aws-encryption.md](/Users/anyulled/IdeaProjects/FaceLocator/docs/aws-encryption.md)
- [docs/aws-nextjs-boundary.md](/Users/anyulled/IdeaProjects/FaceLocator/docs/aws-nextjs-boundary.md)
- [docs/aws-operator-runbook.md](/Users/anyulled/IdeaProjects/FaceLocator/docs/aws-operator-runbook.md)
- [docs/aws-verification-checklist.md](/Users/anyulled/IdeaProjects/FaceLocator/docs/aws-verification-checklist.md)

The schema bootstrap placeholder for the PostgreSQL boundary lives at [scripts/sql/bootstrap.sql](/Users/anyulled/IdeaProjects/FaceLocator/scripts/sql/bootstrap.sql).

## Commands

```bash
pnpm dev
pnpm lint
pnpm test
pnpm build
```

## Next tickets

This scaffold is intentionally narrow and mock-backed. Follow the design pack in ticket order for contracts, page hardening, client UX, routes, idempotency, logging, telemetry, persistence, and AWS boundary substitution.
