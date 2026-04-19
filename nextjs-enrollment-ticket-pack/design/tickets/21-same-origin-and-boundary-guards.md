# Ticket 21 — Same-Origin and Boundary Guards

## Objective
Keep the browser-facing surface narrow.

## Requirements
- Ensure client uses same-origin relative URLs.
- Avoid adding CORS complexity in this iteration.
- Prevent client components from importing server-only code.

## Acceptance criteria
- Boundary violations are removed.
- Network paths remain internal to the app.
