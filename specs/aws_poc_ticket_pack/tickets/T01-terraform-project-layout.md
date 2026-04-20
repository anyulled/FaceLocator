# T01 — Create Terraform project layout

## Objective
Create the minimal Terraform layout to manage the AWS POC reproducibly.

## Required structure
```text
infra/
  providers.tf
  variables.tf
  locals.tf
  iam.tf
  s3.tf
  lambda.tf
  rekognition.tf
  secrets.tf
  database.tf
  outputs.tf
  versions.tf
  terraform.tfvars.example
```

## Requirements
- pin Terraform version
- pin AWS provider version
- define region variable
- define environment variable defaulting to `poc`
- use consistent naming locals

## Acceptance criteria
- `terraform init` succeeds
- `terraform validate` succeeds
- no copy-pasted resource names with inconsistent prefixes
