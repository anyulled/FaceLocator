# T18 — Define delete workflow for biometric-related data

## Objective
Create a concrete deletion path instead of vague compliance claims.

## Delete targets
- selfie object in S3
- event-photo object when applicable
- Rekognition face enrollment entry
- database enrollment/match records, or anonymization where required

## Requirements
- define the sequence of deletion actions
- identify which parts are infrastructure and which are application logic
- produce at least a script/spec placeholder for operator-driven deletion in the POC

## Acceptance criteria
- delete workflow is documented and actionable
- no component is omitted from the deletion plan
