# T06 — Provision Secrets Manager secret for database credentials

## Objective
Create a secret to hold database connection credentials for Lambda/runtime access.

## Requirements
- use AWS Secrets Manager
- secret name derived from app/environment
- structure secret payload as JSON with host, port, dbname, username, password
- do not hardcode secrets in source files

## Acceptance criteria
- secret resource exists
- secret name is output
- Lambda can be wired to read it later
