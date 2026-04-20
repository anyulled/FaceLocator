# T23 — Create a POC verification checklist

## Objective
Provide a deterministic way to verify that the minimal infrastructure works end to end.

## Checklist steps
- Terraform validates and applies
- upload a selfie object to the selfies bucket
- confirm selfie Lambda invocation
- confirm Rekognition enrollment result is written or logged
- upload an event photo to the event-photos bucket
- confirm event-photo Lambda invocation
- confirm photo record/match-preparation result is written or logged
- inspect lifecycle and retention settings
- confirm least-privilege roles are in place

## Acceptance criteria
- checklist is executable by an operator
- each step has an observable outcome
