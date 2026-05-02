export default {
  '*.{ts,tsx}': ['oxfmt --check'],
  'src/**/*.{ts,tsx}': ['oxlint --config oxlint.fast.json', 'oxlint --config oxlint.deep.json'],
  '*.{json,md,yml,yaml}': ['oxfmt --check'],
};
