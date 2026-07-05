// ISD-NOTE: Using flat-config eslint.config.mjs extending next/core-web-vitals and next/typescript.
// eslint-config-next 15 supports the flat config API. If this fails, fall back to .eslintrc.json.
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Vendored third-party source — must NOT be linted. We pin these at a
  // specific commit hash (see src/vendor/foliate-js/VENDOR.md), so any
  // change to them is an auditable vendor-bump, not a code-quality fix.
  {
    ignores: ['src/vendor/**'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];

export default eslintConfig;
