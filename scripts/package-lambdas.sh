#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/build/lambdas"

mkdir -p "${BUILD_DIR}"

package_lambda() {
  local lambda_dir="$1"
  local lambda_name
  lambda_name="$(basename "${lambda_dir}")"

  echo "Packaging ${lambda_name}"
  pushd "${lambda_dir}" >/dev/null

  npm install --omit=dev --no-package-lock

  rm -f "${BUILD_DIR}/${lambda_name}.zip"
  zip -qr "${BUILD_DIR}/${lambda_name}.zip" .

  popd >/dev/null
}

package_lambda_if_present() {
  local lambda_dir="$1"

  if [ -d "${lambda_dir}" ]; then
    package_lambda "${lambda_dir}"
  else
    echo "Skipping missing lambda directory ${lambda_dir}"
  fi
}

package_lambda "${ROOT_DIR}/lambdas/selfie-enrollment"
package_lambda "${ROOT_DIR}/lambdas/event-photo-worker"
package_lambda "${ROOT_DIR}/lambdas/matched-photo-notifier"

echo "Lambda packages written to ${BUILD_DIR}"
