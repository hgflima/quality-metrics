<!--
  Claude Code PostToolUse hook snippet for `quality-metrics`.

  Append the section below to your project's `CLAUDE.md` (or the equivalent
  Claude Code rules file) so the agent runs the fast quality-metrics tier
  every time it writes a TypeScript file. The fast tier (WMC + Halstead +
  LCOM) is intentionally local-only — no cross-file analysis — so it stays
  cheap enough to run on every Write/Edit/MultiEdit.

  The deep tier (CBO + DIT) is gated at pre-commit time via lint-staged
  instead. See `fixtures/lintstagedrc.example.js`.
-->

## Hooks

### PostToolUse: Lint on file write

After writing any TypeScript file, run the fast quality metrics tier:

```bash
# Triggered by: Write, Edit, MultiEdit tools on *.ts / *.tsx files
oxlint --config oxlint.fast.json "$FILE"
```

If violations are found, fix them before writing the next file.
