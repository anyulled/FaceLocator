# T13 — Define least-privilege IAM for event-photo worker Lambda

## Objective
Restrict the event-photo worker to only what it needs.

## Required permissions
- read object from event-photos bucket
- optionally call Rekognition search APIs if used in the POC
- read database secret from Secrets Manager
- write logs to CloudWatch
- connect to the database through the chosen mechanism

## Acceptance criteria
- no permissions to selfies bucket unless explicitly justified
- no overbroad wildcard policy
