# T12 — Define least-privilege IAM for selfie enrollment Lambda

## Objective
Restrict the selfie enrollment worker to only what it needs.

## Required permissions
- read object from selfies bucket
- call Rekognition `IndexFaces`
- read database secret from Secrets Manager
- write logs to CloudWatch
- connect to the database through the chosen mechanism

## Acceptance criteria
- no permissions to event-photos bucket
- no permissions unrelated to enrollment
- policy is attached only to the selfie Lambda role
