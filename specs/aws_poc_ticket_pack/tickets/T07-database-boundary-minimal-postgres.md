# T07 — Define minimal PostgreSQL persistence boundary

## Objective
Provide the smallest database setup consistent with the POC and the need to track attendees, consent, enrollments, event photos, and matches.

## Required logical tables
- events
- attendees
- event_attendees
- consents
- face_enrollments
- event_photos
- photo_face_matches

## Constraints
- keep infrastructure minimal
- no premature scaling concerns
- if actual DB provisioning is deferred, define clear variables/outputs and bootstrap SQL placeholders

## Acceptance criteria
- persistence boundary is explicit
- runtime knows where credentials come from
- schema bootstrap path is documented
