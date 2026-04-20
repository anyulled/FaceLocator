# T14 — Establish CloudWatch logging baseline

## Objective
Ensure both worker Lambdas are observable enough for POC debugging.

## Requirements
- each Lambda logs to CloudWatch
- retention period set explicitly
- log group naming follows function names
- application logs include object key, event id if derivable, and processing outcome

## Acceptance criteria
- log groups are present
- retention is not left implicit forever
- operators can trace a failed upload processing attempt
