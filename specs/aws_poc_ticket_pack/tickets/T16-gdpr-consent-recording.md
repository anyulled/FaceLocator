# T16 — Model and persist explicit GDPR consent

## Objective
Ensure facial-recognition-related consent is captured and stored from day one.

## Requirements
- store consent text version
- store consent timestamp
- link consent to attendee and event
- support future withdrawal timestamp
- consent must explicitly cover selfie use for facial matching against event/session photos and later delivery of matched photos

## Acceptance criteria
- consent storage exists in the schema or persistence contract
- no enrollment is treated as valid without a consent record
