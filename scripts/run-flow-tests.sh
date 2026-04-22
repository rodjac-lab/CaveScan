#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env.playwright.local"

if [[ -f ".env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.local"
  set +a
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

npx playwright test tests/flows --workers=1 "$@"
