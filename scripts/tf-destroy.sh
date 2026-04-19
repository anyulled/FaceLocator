#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Destructive action: terraform destroy will remove the AWS POC resources managed in infra/."
"${ROOT_DIR}/scripts/tf-init.sh"
terraform -chdir="${ROOT_DIR}/infra" destroy "$@"
