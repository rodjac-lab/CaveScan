#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env.playwright.local"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

npx playwright test tests/smoke "$@"
