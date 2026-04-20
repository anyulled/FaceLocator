# T00 — Freeze POC scope and non-goals

## Objective
Establish the exact AWS infrastructure scope for the POC and prevent overengineering.

## Context
The POC supports:
- attendee selfie upload
- attendee enrollment for later face matching
- event photo storage
- later comparison of event photos against enrolled faces
- GDPR baseline controls from day one

## In scope
- AWS account usage through named IAM users/roles only
- Terraform-based provisioning
- S3 buckets for selfies and event photos
- Lambda functions for selfie enrollment and event-photo processing
- Rekognition collection
- PostgreSQL persistence boundary
- Secrets Manager
- CloudWatch logs
- lifecycle and deletion controls

## Out of scope
- high availability
- redundancy
- sharding
- multi-region
- Step Functions
- EventBridge
- SQS
- WAF
- CDN
- VPC hardening beyond what is immediately necessary
- production-grade CI/CD

## Acceptance criteria
- README or ADR states the POC boundaries explicitly
- all later tickets conform to these boundaries
- no resource is added without direct linkage to a ticketed need
