#!/usr/bin/env bash
# Claude Code PostToolUse hook — runs the fast quality-metrics tier on
# every TypeScript file just edited. Drop at .claude/hooks/post-edit.sh
# and `chmod +x` so Claude Code can execute it.
set -euo pipefail

files=()
for path in ${CLAUDE_FILE_PATHS:-}; do
  case "$path" in
    src/*.ts|src/*.tsx) files+=("$path") ;;
  esac
done

[ ${#files[@]} -eq 0 ] && exit 0

npx oxlint --config oxlint.fast.json "${files[@]}"
