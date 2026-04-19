# AWS Encryption Choice

The POC standardizes on SSE-S3 for both S3 buckets.

## Rationale

- It satisfies encryption at rest for the narrow POC scope.
- It avoids the extra operational overhead of introducing customer-managed KMS keys before there is a ticketed need for them.
- Secrets Manager keeps its default service-managed encryption for the database secret.

## Where it is applied

- `infra/s3.tf` configures `AES256` server-side encryption for the selfies bucket.
- `infra/s3.tf` configures `AES256` server-side encryption for the event-photos bucket.
- `infra/secrets.tf` stores database credentials in Secrets Manager without hardcoding the secret in source.
