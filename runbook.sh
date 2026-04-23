#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT_DIR}"

AWS_PROFILE="${AWS_PROFILE:-face-locator-operator}"
AWS_REGION="${AWS_REGION:-eu-west-1}"
TF_ENVIRONMENT="${TF_ENVIRONMENT:-poc}"
EVENT_SLUG="${EVENT_SLUG:-speaker-session-2026}"
EVENT_BASE_URL="${EVENT_BASE_URL:-}"
APPLY_SCHEMA="${APPLY_SCHEMA:-false}"
RUN_TERRAFORM_APPLY="${RUN_TERRAFORM_APPLY:-false}"
INVOKE_NOTIFIER="${INVOKE_NOTIFIER:-false}"
TAIL_LOGS="${TAIL_LOGS:-false}"
ADMIN_READ_BACKEND="${ADMIN_READ_BACKEND:-lambda}"
ADMIN_READ_LAMBDA_NAME="${ADMIN_READ_LAMBDA_NAME:-face-locator-${TF_ENVIRONMENT}-admin-events-read}"
PUBLIC_REGISTRATION_BACKEND="${PUBLIC_REGISTRATION_BACKEND:-lambda}"
ATTENDEE_REGISTRATION_LAMBDA_NAME="${ATTENDEE_REGISTRATION_LAMBDA_NAME:-face-locator-${TF_ENVIRONMENT}-attendee-registration}"

NOTIFIER_FUNCTION_NAME="${NOTIFIER_FUNCTION_NAME:-face-locator-${TF_ENVIRONMENT}-matched-photo-notifier}"
NOTIFIER_LOG_GROUP="${NOTIFIER_LOG_GROUP:-/aws/lambda/${NOTIFIER_FUNCTION_NAME}}"
WORKER_LOG_GROUP="${WORKER_LOG_GROUP:-/aws/lambda/face-locator-${TF_ENVIRONMENT}-event-photo-worker}"
SCHEDULER_PREFIX="${SCHEDULER_PREFIX:-${NOTIFIER_FUNCTION_NAME}}"

run() {
  echo
  echo "==> $*"
  "$@"
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd aws
need_cmd pnpm
need_cmd jq

export AWS_PROFILE AWS_REGION

echo "Using:"
echo "  AWS_PROFILE=${AWS_PROFILE}"
echo "  AWS_REGION=${AWS_REGION}"
echo "  TF_ENVIRONMENT=${TF_ENVIRONMENT}"
echo "  EVENT_SLUG=${EVENT_SLUG}"
echo "  ADMIN_READ_BACKEND=${ADMIN_READ_BACKEND}"
echo "  PUBLIC_REGISTRATION_BACKEND=${PUBLIC_REGISTRATION_BACKEND}"

run aws sts get-caller-identity

echo
echo "==> Checking required production env vars (from current shell)"
required_env=(
  MATCH_LINK_SIGNING_SECRET
  SES_FROM_EMAIL
  FACE_LOCATOR_EVENT_PHOTOS_BUCKET
  ADMIN_READ_BACKEND
  PUBLIC_REGISTRATION_BACKEND
)
for v in "${required_env[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    echo "WARNING: ${v} is not set in this shell."
  else
    echo "OK: ${v} is set"
  fi
done

if [[ -z "${DATABASE_SECRET_NAME:-}" && -z "${DATABASE_SECRET_ARN:-}" && -z "${FACE_LOCATOR_DATABASE_SECRET_NAME:-}" && -z "${FACE_LOCATOR_DATABASE_SECRET_ARN:-}" && -z "${FACE_LOCATOR_DATABASE_SECRET:-}" ]]; then
  echo "WARNING: No DB secret ref env var detected in this shell (DATABASE_SECRET_* / FACE_LOCATOR_DATABASE_SECRET_*)."
else
  echo "OK: DB secret ref env var detected."
fi

run pnpm -s dlx tsx -e "import { getDatabasePool } from './lib/aws/database';
(async () => {
  const pool = await getDatabasePool();
  const t = await pool.query(\"select to_regclass('public.matched_photo_notifications') as v\");
  const c1 = await pool.query(\"select exists (select 1 from information_schema.columns where table_schema='public' and table_name='event_attendees' and column_name='photo_notifications_unsubscribed_at') as v\");
  const c2 = await pool.query(\"select exists (select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='public_base_url') as v\");
  console.log(JSON.stringify({
    matched_photo_notifications: t.rows[0].v !== null,
    photo_notifications_unsubscribed_at: c1.rows[0].v,
    events_public_base_url: c2.rows[0].v
  }, null, 2));
  await pool.end();
})().catch((err) => { console.error(err); process.exit(1); });"

if [[ "${APPLY_SCHEMA}" == "true" ]]; then
  run pnpm -s dlx tsx scripts/bootstrap-db.ts
fi

if [[ -n "${EVENT_BASE_URL}" ]]; then
  run pnpm -s dlx tsx -e "import { getDatabasePool } from './lib/aws/database';
  (async () => {
    const pool = await getDatabasePool();
    await pool.query('update events set public_base_url = \$1 where slug = \$2', ['${EVENT_BASE_URL}', '${EVENT_SLUG}']);
    const res = await pool.query('select id, slug, public_base_url from events where slug = \$1', ['${EVENT_SLUG}']);
    console.log(JSON.stringify(res.rows, null, 2));
    await pool.end();
  })().catch((err) => { console.error(err); process.exit(1); });"
else
  echo
  echo "==> Skipping event base URL update (set EVENT_BASE_URL to apply)"
fi

run aws sesv2 get-account
run aws sesv2 get-email-identity --email-identity "${SES_FROM_EMAIL:-anyulled@gmail.com}" || true

run ./scripts/package-lambdas.sh
run ./scripts/tf-init.sh
run terraform -chdir=infra validate

if [[ "${RUN_TERRAFORM_APPLY}" == "true" ]]; then
  run ./scripts/tf-apply.sh
else
  run terraform -chdir=infra plan
fi

run aws lambda get-function --function-name "${NOTIFIER_FUNCTION_NAME}"
run aws scheduler list-schedules --name-prefix "${SCHEDULER_PREFIX}"

if [[ "${ADMIN_READ_BACKEND}" == "lambda" ]]; then
  run aws lambda get-function --function-name "${ADMIN_READ_LAMBDA_NAME}"
fi

if [[ "${PUBLIC_REGISTRATION_BACKEND}" == "lambda" ]]; then
  run aws lambda get-function --function-name "${ATTENDEE_REGISTRATION_LAMBDA_NAME}"
fi

if [[ "${INVOKE_NOTIFIER}" == "true" ]]; then
  run aws lambda invoke --function-name "${NOTIFIER_FUNCTION_NAME}" --payload '{}' /tmp/notifier-response.json
  run cat /tmp/notifier-response.json
fi

if [[ "${TAIL_LOGS}" == "true" ]]; then
  run aws logs tail "${NOTIFIER_LOG_GROUP}" --since 30m
  run aws logs tail "${WORKER_LOG_GROUP}" --since 30m
fi

run pnpm -s dlx tsx -e "import { getDatabasePool } from './lib/aws/database';
(async () => {
  const pool = await getDatabasePool();
  const res = await pool.query('select event_id, attendee_id, sent_at, match_count from matched_photo_notifications order by sent_at desc limit 50');
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
})().catch((err) => { console.error(err); process.exit(1); });"

echo
echo "Runbook checks completed."
echo "Tips:"
echo "  APPLY_SCHEMA=true ./runbook.sh"
echo "  EVENT_BASE_URL=https://your-domain.com ./runbook.sh"
echo "  RUN_TERRAFORM_APPLY=true INVOKE_NOTIFIER=true TAIL_LOGS=true ./runbook.sh"
