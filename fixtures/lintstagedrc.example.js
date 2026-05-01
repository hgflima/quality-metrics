/**
 * lint-staged configuration example for `quality-metrics`.
 *
 * Drop into your project as `.lintstagedrc.js` (or merge into an existing one)
 * to gate pre-commits on the fast and deep tiers in sequence:
 *
 * 1. `oxlint.fast.json` runs WMC + Halstead + LCOM (~tens of ms per file).
 * 2. `oxlint.deep.json` runs CBO + DIT via ts-morph (~seconds, type-aware).
 *
 * Both presets ship in this package under `configs/`. Either copy them to your
 * repo root (referenced here by their bare filenames) or point at the
 * package-installed copies, e.g.:
 *
 * 'oxlint --config node_modules/quality-metrics/configs/oxlint.fast.json'
 *
 * See `docs/mvp/03-technical-architecture.md` §"lint-staged Configuration".
 */
export default {
  '*.{ts,tsx}': ['oxlint --config oxlint.fast.json', 'oxlint --config oxlint.deep.json'],
};
