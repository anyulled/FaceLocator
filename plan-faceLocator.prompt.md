# Plan: FaceLocator AWS Architecture Simplification (VPC Elimination)

## TL;DR
The current architecture deploys 5 VPC-attached Lambdas + 3 interface VPC endpoints (Secrets Manager, Rekognition, SES) that add ~$21.60/month in endpoint costs and 50–200ms of Lambda cold-start latency. These exist solely to allow Lambdas to reach a private RDS instance, but the default `terraform.tfvars` still exposes RDS publicly (`database_network_migration_phase = "legacy"`). The fastest path to cost savings and simplicity is migrating from RDS db.t3.micro to **Aurora Serverless v2**, removing all Lambda VPC configs, and eliminating the 3 interface endpoints. This reduces monthly cost by ~70% and removes all VPC-related operational complexity.

---

## Data Flow (Current)

Browser → Next.js Amplify → (IAM invoke) → Lambda (VPC) → RDS (private or public)
                                         ↓
                              Lambdas also call: S3, Rekognition, Secrets Manager, SES
                              (all through VPC interface endpoints when in VPC mode)

S3 event (selfie upload) → selfie-enrollment Lambda (VPC)
S3 event (photo upload)  → event-photo-worker Lambda (VPC)
EventBridge Scheduler    → matched-photo-notifier Lambda (VPC)

## Key Agents & Their VPC Attachment Status

| Lambda | VPC | Needs VPC? |
|--------|-----|-----------|
| admin-events-read | conditional | Only if RDS is private |
| attendee-registration | conditional | Only if RDS is private |
| selfie-enrollment | conditional | Only if RDS is private |
| event-photo-worker | conditional | Only if RDS is private |
| matched-photo-notifier | conditional | Only if RDS is private |

## Cost Breakdown (Current)
- RDS db.t3.micro: ~$29/month
- Secrets Manager endpoint (Interface): ~$7.20/month
- Rekognition endpoint (Interface): ~$7.20/month
- SES endpoint (Interface): ~$7.20/month
- Lambda cold start penalty (VPC): 50–200ms per cold start (user-facing)
- **Total VPC-related cost: ~$50.60/month**

## Cost After Simplification (Aurora Serverless v2, no VPC Lambdas)
- Aurora Serverless v2 (min_capacity=0.5): ~$0.50–$3/month
- No interface VPC endpoints: $0
- Lambda cold starts: 10–50ms (vs. 50–200ms)
- **Estimated savings: ~$47–50/month (70% reduction)**

---

## Plan Steps

### Phase 1: Database Migration (blocks Phase 2)
1. Replace `aws_db_instance.poc` in `infra/database.tf` with `aws_rds_cluster` + `aws_rds_cluster_instance` (Aurora PostgreSQL Serverless v2, min_capacity=0.5, max_capacity=1)
2. Update Secrets Manager secret in `infra/secrets.tf` to store Aurora cluster endpoint
3. Update `infra/locals.tf` — remove `database_network_migration_phase` logic or simplify to single mode
4. Update `infra/variables.tf` — remove now-unused `database_network_migration_phase` variable
5. Update `infra/outputs.tf` — expose Aurora cluster endpoint

### Phase 2: Remove Lambda VPC (parallel with Phase 1 prep, depends on Phase 1 completion)
6. Remove all `dynamic "vpc_config"` blocks from Lambdas in `infra/lambda.tf`
7. Remove `local.use_lambda_vpc` conditional in `infra/locals.tf`
8. Remove `aws_iam_role_policy_attachment.*_vpc_access` from `infra/iam.tf`
9. Remove Lambda security group (`face-locator-poc-lambda-runtime-sg`) from `infra/iam.tf` or wherever defined

### Phase 3: Remove Interface VPC Endpoints (depends on Phase 2)
10. Remove `aws_vpc_endpoint.secretsmanager`, `aws_vpc_endpoint.rekognition`, `aws_vpc_endpoint.ses` from Terraform (likely in `infra/database.tf` or dedicated endpoints file)
11. Keep `aws_vpc_endpoint.s3` (S3 gateway endpoint) — it's free and helpful
12. Remove endpoint security group (`face-locator-poc-private-endpoints-sg`)

### Phase 4: Remove Private Subnets (depends on Phase 3)
13. Remove `aws_subnet.db_private` and associated `aws_route_table.db_private` from `infra/database.tf`
14. Remove security group `face-locator-poc-db-sg` ingress rule referencing Lambda runtime SG (now DB just needs its own SG — or remove entirely if Aurora doesn't expose a public endpoint but is accessed via security group allowing Lambda egress to DB port)

### Phase 5: Documentation & Runbook (parallel with phases 3–4)
15. Update `infra/terraform.tfvars` — remove `database_network_migration_phase` or set to new default
16. Update `README.md` — update architecture section and cost estimate
17. Update `docs/aws-database-boundary.md` — reflect Aurora Serverless
18. Update `docs/aws-amplify-deployment.md` — remove VPC troubleshooting section
19. Update `runbook.sh` — update DB endpoint references

### Phase 6: Security Hardening (quick wins, can run parallel)
20. Enable Cognito MFA (`mfa_configuration = "OPTIONAL"`) in `infra/cognito.tf`
21. Fix PostgreSQL SSL validation in Lambda code — change `ssl: { rejectUnauthorized: false }` to `ssl: true` in `lambdas/*/index.js`
22. Add CloudWatch budget alarm in Terraform (~$50/month threshold)

---

## Relevant Files
- `infra/database.tf` — replace RDS with Aurora Serverless v2
- `infra/lambda.tf` — remove vpc_config blocks
- `infra/iam.tf` — remove VPC Lambda permissions and security groups
- `infra/locals.tf` — remove use_lambda_vpc conditional
- `infra/variables.tf` — remove database_network_migration_phase
- `infra/outputs.tf` — update DB endpoint output
- `infra/secrets.tf` — update secret shape for Aurora
- `infra/cognito.tf` — enable MFA
- `infra/terraform.tfvars` — clean up variables
- `lambdas/*/index.js` — fix SSL config
- `docs/aws-database-boundary.md`
- `docs/aws-amplify-deployment.md`
- `README.md`
- `runbook.sh`

---

## Verification
1. `terraform -chdir=infra validate`
2. `terraform -chdir=infra plan` — confirm no VPC endpoints or Lambda VPC configs remain
3. `pnpm exec vitest run` — all unit/integration tests pass
4. `pnpm exec tsc --noEmit` — no TypeScript errors
5. Test Lambda invocations manually (admin events, attendee registration) — confirm cold start times drop
6. Check CloudWatch logs for Lambda init_duration (should be <100ms vs. 50–200ms before)
7. Smoke test hosted admin page via Amplify production URL

---

## Decisions
- **Aurora Serverless v2** is preferred over staying with RDS (saves $29/month, eliminates VPC requirement)
- **No NAT Gateway** — removes the need to route Lambda traffic through NAT since Lambdas leave VPC
- **No API Gateway** — Next.js IAM Lambda invoke pattern is preserved (no extra hops)
- **S3 Gateway endpoint** may be kept (free, no VPC Lambdas need it, but harmless)
- **Scope**: Phases 1–4 are the core change. Phase 6 (security) is a separate quick-win PR.

---

## Further Considerations
1. **Aurora Serverless min_capacity=0.5 ACU** — at $0.12/ACU-hour this is ~$43/month minimum. Consider `min_capacity=0` (pause on inactivity, free when idle, 15-30 second cold start after pause). For a POC with intermittent use, pause mode is more cost-effective. Trade-off: first request after 5 minutes of inactivity will trigger a ~15 second Aurora cold start.
2. **Data migration**: Existing RDS data needs to be exported and imported into Aurora. For POC with test data, a `pg_dump | pg_restore` is sufficient. Plan whether to do a live migration or accept downtime.
3. **SSL cert for Aurora**: Aurora uses a different CA certificate bundle than RDS. Update the `ssl` config in Lambda code to use the `global-bundle.pem` from AWS.
