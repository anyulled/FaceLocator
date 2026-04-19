# Ticket 03 — Client Enrollment Form

## Objective
Implement the interactive enrollment form as a Client Component.

## Requirements
- Create `components/events/attendee-enrollment-form.tsx`.
- Use `'use client'`.
- Manage form state for name, email, consent, selfie.
- Show preview of selected selfie.
- Validate before submission.
- Call client API wrappers, not `fetch` directly inline everywhere.
- Disable duplicate submissions while in flight.

## Constraints
- Do not declare the component as `async`.
- Async behavior must live in event handlers or hooks.

## Acceptance criteria
- Preview updates when a file is selected.
- Submit button disables during in-flight work.
- Inline validation errors are shown per field.
