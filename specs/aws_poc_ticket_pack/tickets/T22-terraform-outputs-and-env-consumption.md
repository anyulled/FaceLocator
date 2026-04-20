# T22 — Publish Terraform outputs needed by the application

## Objective
Expose only the infrastructure values the app/runtime actually needs.

## Expected outputs
- selfies bucket name
- event-photos bucket name
- Rekognition collection id
- database secret name
- Lambda names if useful for debugging

## Acceptance criteria
- outputs are minimal and intentional
- no secret values are output directly
