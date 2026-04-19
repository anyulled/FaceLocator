# Ticket 15 — Telemetry Stubs

## Objective
Instrument the funnel without binding to a real analytics provider.

## Events
- enrollment_form_viewed
- enrollment_file_selected
- enrollment_submit_clicked
- enrollment_registration_created
- enrollment_upload_started
- enrollment_upload_succeeded
- enrollment_processing_seen
- enrollment_completed
- enrollment_failed

## Requirements
- Implement mockable telemetry hooks or service boundary.
- Do not emit PII.

## Acceptance criteria
- Telemetry calls are isolated and testable.
