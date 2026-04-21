# Ticket 25 — Admin Events and Photo Operations Console

## Objective
Provide an authenticated admin page to manage events and event photos, including creation of new events and deletion of photos individually or in batch.

## Actors
- Admin operator: creates and reviews events, reviews event photos, deletes selected photos.

## In scope
- New admin area entry point for event operations.
- Event list view with key metadata and action to open each event.
- Event creation flow with required validation.
- Event detail media view showing photos for that event.
- Single-photo delete action.
- Multi-select and batch delete action.
- Clear success/failure feedback for all destructive actions.

## Out of scope
- Public-facing attendee experience changes.
- Editing existing event metadata beyond create (can be ticketed separately).
- Hard delete recovery/restore bin.
- Advanced media tools (crop, rotate, AI moderation).
- Role hierarchy beyond a single admin role.

## Functional requirements
### Admin route
- Add a dedicated route (for example `/admin/events`) that is not linked from public pages.
- Access must require admin authorization at request time.

### Event list
- Show at least: event title, slug, venue, scheduled date range, and total photo count.
- Include action to open event media management page.
- Include action to create a new event.

### Create event
- Required fields: title, slug, venue, start date/time, end date/time, description.
- Slug must be unique and URL-safe.
- End date/time must be after start date/time.
- On success, event appears in admin list and can be opened immediately.

### Event media management
- Show event metadata header (title, slug, date range, photo count).
- Render photos in a pageable or virtualized grid suitable for large volumes.
- Each photo tile must include a stable photo identifier and selection checkbox.
- Provide select-one and select-many behavior.

### Delete single photo
- Photo tile action deletes exactly one selected photo.
- Require explicit confirmation before delete.
- Remove deleted item from grid without full page refresh.

### Delete in batch
- Operator can select multiple photos and trigger one delete operation.
- Require explicit confirmation including selected item count.
- Partial failure handling must show which photo IDs failed and why.
- Successful deletes are removed from the grid and counters update.

### Empty and error states
- Event with zero photos has a dedicated empty state.
- Failed loads and failed deletes show actionable retry messaging.

## Data and API contract requirements
### Contracts
- Add or extend admin-facing contracts for create event, list events with photo counts, list event photos, delete one event photo, and delete many event photos.

### Delete idempotency
- Deleting already-deleted photo IDs should not crash the operation.
- Response should report per-ID status (`deleted`, `not_found`, `failed`).

### Audit baseline
- Log admin identity, event slug, targeted photo ID count, and operation result for delete actions.

## UX and safety requirements
- Destructive actions use a clear danger style and confirmation step.
- Batch delete button is disabled when no photo is selected.
- During delete execution, controls are temporarily disabled to prevent duplicate submits.
- After any operation, announce result in an accessible status region.

## Acceptance criteria
- Admin can create a valid new event and see it in the list immediately.
- Admin can open an event and view its photo gallery.
- Admin can delete a single photo and see the grid/counter update.
- Admin can delete multiple selected photos in one action.
- Batch delete returns understandable feedback for full success and partial failure cases.
- Non-admin access to admin routes is denied.
- Tests cover create-event validation, media listing, single delete, batch delete, and unauthorized access.

## Suggested implementation slices
- Slice 1: admin route guard + event list shell.
- Slice 2: create-event form + create API + validations.
- Slice 3: event photos grid + list API.
- Slice 4: single delete flow + optimistic update.
- Slice 5: batch delete flow + partial failure reporting + audit logging.
- Slice 6: automated tests (unit, route, and e2e smoke for admin flow).

## Analyst assumptions to confirm
- Admin authorization will reuse the existing application auth/session mechanism.
- Photo deletion is permanent for the POC (no recover/undo queue).
- Photo list defaults to newest-first and supports pagination for large events.
- Batch delete may process asynchronously only if count exceeds an agreed threshold.
