#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${ROOT_DIR}/scripts/package-lambdas.sh"
"${ROOT_DIR}/scripts/tf-init.sh"

terraform -chdir="${ROOT_DIR}/infra" apply "$@"
