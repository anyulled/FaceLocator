# T02 — Establish IAM bootstrap discipline and root avoidance

## Objective
Ensure the POC is deployed and operated without using the AWS root user.

## Requirements
- document that root user must not be used for day-to-day work
- create or assume a named operator principal for Terraform apply
- do not grant administrator access to runtime identities
- separate deployer permissions from application runtime permissions

## Deliverables
- operator setup notes
- Terraform comments or documentation for expected deployer identity
- no runtime policy with `Action: *` and `Resource: *`

## Acceptance criteria
- runtime IAM roles are least privilege
- deployment instructions do not mention root credentials
