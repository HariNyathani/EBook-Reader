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

const eslintConfig = [...compat.extends('next/core-web-vitals', 'next/typescript')];

export default eslintConfig;
