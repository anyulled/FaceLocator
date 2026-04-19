#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  AWS_PROFILE=face-locator-poc \
  SELFIES_BUCKET_NAME=... \
  EVENT_PHOTOS_BUCKET_NAME=... \
  REKOGNITION_COLLECTION_ID=... \
  DATABASE_URL=postgres://... \
  ./scripts/delete-biometric-data.sh <event-id> <attendee-id> [rekognition-face-id]

This operator-driven placeholder deletes or tombstones biometric data for a
single attendee within a single event. Review the runbook before using it.
EOF
}

if [[ "${1:-}" == "" || "${2:-}" == "" ]]; then
  usage
  exit 1
fi

EVENT_ID="$1"
ATTENDEE_ID="$2"
REKOGNITION_FACE_ID="${3:-}"

: "${SELFIES_BUCKET_NAME:?SELFIES_BUCKET_NAME must be set}"
: "${EVENT_PHOTOS_BUCKET_NAME:?EVENT_PHOTOS_BUCKET_NAME must be set}"
: "${REKOGNITION_COLLECTION_ID:?REKOGNITION_COLLECTION_ID must be set}"
: "${DATABASE_URL:?DATABASE_URL must be set}"

echo "Deleting selfie objects for attendee ${ATTENDEE_ID} in event ${EVENT_ID}"
aws s3 rm "s3://${SELFIES_BUCKET_NAME}/events/${EVENT_ID}/attendees/${ATTENDEE_ID}/" --recursive

if [[ -n "${REKOGNITION_FACE_ID}" ]]; then
  echo "Deleting Rekognition face ${REKOGNITION_FACE_ID}"
  aws rekognition delete-faces \
    --collection-id "${REKOGNITION_COLLECTION_ID}" \
    --face-ids "${REKOGNITION_FACE_ID}"
fi

echo "Removing database records"
psql "${DATABASE_URL}" <<SQL
delete from photo_face_matches
where attendee_id = '${ATTENDEE_ID}';

delete from face_enrollments
where attendee_id = '${ATTENDEE_ID}'
  and event_id = '${EVENT_ID}';

update consents
set withdrawn_at = now()
where attendee_id = '${ATTENDEE_ID}'
  and event_id = '${EVENT_ID}'
  and withdrawn_at is null;

update event_attendees
set enrollment_status = 'deleted',
    withdrawal_at = now(),
    updated_at = now()
where attendee_id = '${ATTENDEE_ID}'
  and event_id = '${EVENT_ID}';
SQL

echo "Manual follow-up: inspect event-photo retention and remove any already-delivered photos tied to the attendee if policy requires it."
