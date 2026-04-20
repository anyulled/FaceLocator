# T15 — Add minimal bash automation scripts

## Objective
Provide lightweight automation for common operator tasks.

## Required scripts
- `scripts/tf-init.sh`
- `scripts/tf-apply.sh`
- `scripts/package-lambdas.sh`
- `scripts/tf-destroy.sh`

## Requirements
- bash only
- fail fast with `set -euo pipefail`
- no secret values hardcoded
- scripts document expected environment variables or AWS profile usage

## Acceptance criteria
- scripts are executable
- basic usage is documented
