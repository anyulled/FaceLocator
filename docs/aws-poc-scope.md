# AWS POC Scope and Constraints

This document freezes the infrastructure scope for the AWS-backed FaceLocator POC so later tickets stay narrow and reproducible.

## In scope

- AWS account usage through named IAM users and roles only
- Terraform-based provisioning
- S3 bucket for attendee selfies
- S3 bucket for event photos
- Lambda for selfie enrollment processing
- Lambda for event-photo processing and later matching preparation
- Rekognition collection
- PostgreSQL-compatible persistence boundary
- Secrets Manager for database credentials
- CloudWatch logging
- lifecycle and deletion controls, including biometric-related deletion paths

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
- removing Lambda VPC attachment without first changing the private database access model
- production-grade CI/CD

## Guardrails

- Use a single AWS region for the full POC.
- Apply least privilege to every IAM role and policy.
- Do not use the root user for implementation or operations.
- Prefer Terraform and small shell scripts over additional orchestration layers.
- Do not add any AWS resource without a direct ticketed requirement.

## Sequencing

- Work the AWS stream from `aws_poc_ticket_pack` in order.
- Complete the foundational infrastructure tickets before resuming the later Next.js persistence and AWS substitution work.
