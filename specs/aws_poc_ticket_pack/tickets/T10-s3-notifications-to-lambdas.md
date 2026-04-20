# T10 — Wire S3 notifications to the correct Lambda functions

## Objective
Connect each bucket to its corresponding processing Lambda.

## Requirements
- selfies bucket triggers selfie enrollment Lambda on object-created events
- event-photos bucket triggers event-photo worker Lambda on object-created events
- Lambda resource policies allow invocation from the corresponding bucket only

## Acceptance criteria
- upload to selfies bucket can invoke only the selfie Lambda
- upload to event-photos bucket can invoke only the event-photo Lambda
- no cross-wiring
