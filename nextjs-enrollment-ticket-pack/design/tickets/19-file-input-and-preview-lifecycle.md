# Ticket 19 — File Input and Preview Lifecycle

## Objective
Make file selection and preview behavior robust.

## Requirements
- Accept one file only.
- Replacing the file replaces the preview.
- Revoke object URLs when replaced or unmounted.
- Clear invalid file selections cleanly.

## Acceptance criteria
- No preview memory leak pattern remains.
- Selecting a second file behaves predictably.
