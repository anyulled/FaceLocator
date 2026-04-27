# ADR-0003: Consolidate Interface Endpoint Security Groups

## Status

Accepted

## Date

2026-04-27

## Context

Phase 1 moved the database baseline to private Aurora Serverless v2.

Phase 2 made Lambda VPC attachment explicit for all database-touching functions.

The original cost-simplification draft for Phase 3 suggested removing interface VPC endpoints. In the current architecture, Lambda functions in private subnets require private egress for Secrets Manager, Rekognition, and SES API calls.

Without a NAT path, removing those endpoints would break runtime behavior.

## Decision Drivers

- Preserve Lambda access to required AWS APIs in private subnets.
- Avoid adding NAT Gateway cost and operational overhead.
- Reduce Terraform resource count where safe.
- Keep networking intent explicit and testable.

## Considered Options

### Option 1: Remove interface endpoints now

- Pros: Fewer endpoint resources.
- Cons: Breaks Secrets Manager/Rekognition/SES access without NAT.

### Option 2: Replace interface endpoints with NAT Gateway

- Pros: Lambdas can access AWS public APIs without interface endpoints.
- Cons: Higher recurring cost and broader egress surface.

### Option 3: Keep interface endpoints and consolidate security groups (selected)

- Pros: Maintains private API egress and connectivity, removes one SG resource, keeps costs lower than NAT.
- Cons: Does not reduce endpoint count.

## Decision

Keep interface VPC endpoints for Secrets Manager, Rekognition, and SES, and consolidate endpoint security controls into the Lambda runtime security group.

## Consequences

### Positive

- Removes dedicated `private_endpoints` security group resource.
- Keeps private-network API access functional.
- Simplifies Terraform graph and security-group management.

### Negative

- Interface endpoints remain in place, so endpoint charges remain.

### Clarification

Interface endpoints remain required with the current private-Aurora + VPC-attached Lambda architecture unless a separate egress strategy (such as NAT) or data-access refactor is introduced.

## Implementation Notes

- Removed `aws_security_group.private_endpoints`.
- Added `aws_vpc_security_group_ingress_rule.lambda_runtime_https_from_self` for TCP/443 self-reference.
- Updated all interface endpoints to use `aws_security_group.lambda_runtime[0].id`.
- Added Phase 3 infra tests for this contract.

## Verification

- `pnpm exec vitest run tests/aws/infra-phase3-endpoint-sg-simplification.test.ts`
- `terraform -chdir=infra validate`

## Related

- [adr/ADR-0001-aurora-serverless-phase1.md](adr/ADR-0001-aurora-serverless-phase1.md)
- [adr/ADR-0002-explicit-lambda-vpc-attachment.md](adr/ADR-0002-explicit-lambda-vpc-attachment.md)
- [infra/database.tf](infra/database.tf)
