#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AWS_PROFILE_VALUE="${AWS_PROFILE:-}"

if [[ -n "${AWS_PROFILE_VALUE}" ]]; then
  echo "Using AWS profile: ${AWS_PROFILE_VALUE}"
else
  echo "AWS_PROFILE is not set. Terraform will use the default AWS credential chain."
fi

terraform -chdir="${ROOT_DIR}/infra" init "$@"
