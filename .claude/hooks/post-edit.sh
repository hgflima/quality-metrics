#!/usr/bin/env bash
set -euo pipefail

# Filter the edited paths down to src/*.ts(x) — the only files oxlint cares
# about here. Other edits (tests, configs, docs) skip the hook.
files=()
for path in ${CLAUDE_FILE_PATHS:-}; do
  case "$path" in
    src/*.ts|src/*.tsx) files+=("$path") ;;
  esac
done

[ ${#files[@]} -eq 0 ] && exit 0

# This project's oxlint config loads compiled rules from dist/. Rebuild when
# the bundle is missing or any src file is newer than it. Skip DTS — oxlint
# doesn't read .d.ts, and DTS dominates tsup's runtime (~340ms vs ~12ms JS).
if [ ! -f dist/index.js ] \
  || [ -n "$(find src -name '*.ts' -newer dist/index.js -print -quit)" ]; then
  npx tsup --no-dts
fi

npx oxlint --config oxlint.fast.json "${files[@]}"
