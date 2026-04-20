You are implementing the AWS infrastructure slice for a minimal POC that supports a Next.js event-photo enrollment application.

Your task is to scaffold only the infrastructure and operational boundaries needed for:
1. attendee selfie upload
2. selfie enrollment processing
3. event photo upload
4. event photo storage for later comparison
5. GDPR baseline controls

Do not implement high availability, redundancy, sharding, multi-region, autoscaling strategy, or broad future-proof platform architecture.

Constraints:
- single AWS region
- least privilege IAM
- no root user usage
- infrastructure as code
- minimal moving parts
- prefer Terraform and small shell scripts
- no Step Functions, EventBridge, queues, VPC complexity, WAF, CDN, or CI/CD unless directly required

Required AWS components:
- S3 bucket for selfies
- S3 bucket for event photos
- Lambda for selfie enrollment
- Lambda for event-photo matching preparation
- Rekognition collection
- PostgreSQL-compatible persistence boundary
- Secrets Manager secret for DB credentials
- IAM roles and policies with least privilege
- lifecycle rules for deletion, including unmatched event photos after 2 days if not otherwise needed
- deletion path for biometric-related data

Expected output:
- Terraform file layout
- Terraform resources
- IAM roles and policies
- Lambda packaging/deployment assumptions
- bash scripts for apply/package where useful
- placeholders where app integration is external
