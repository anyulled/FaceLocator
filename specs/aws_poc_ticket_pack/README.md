# AWS POC Ticket Pack

This pack contains specification tickets for a minimal AWS-backed POC implementing:
- attendee selfie enrollment
- event photo storage
- later face matching preparation
- GDPR baseline controls from day one

Scope constraints:
- minimal POC only
- single region
- no HA, no redundancy, no sharding
- least privilege
- infrastructure as code
- avoid root user
- narrow implementation horizon only

Retention correction:
- unmatched event photos must be deleted after 2 days if not otherwise needed

Suggested execution order:
1. T00 through T05 for baseline AWS foundations
2. T06 through T10 for storage, presign, and enrollment processing
3. T11 through T15 for event photo ingestion and matching preparation
4. T16 through T21 for GDPR, deletion, and operational hardening

Deliverables should be implemented incrementally and validated after each ticket.
