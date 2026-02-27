import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveUiVariant } from './uiVariant.js';

test('resolveUiVariant: uses explicit variant when provided', () => {
  assert.equal(resolveUiVariant('dev', false), 'dev');
  assert.equal(resolveUiVariant('PROD', true), 'prod');
});

test('resolveUiVariant: falls back to dev in development environment', () => {
  assert.equal(resolveUiVariant('', true), 'dev');
  assert.equal(resolveUiVariant(undefined, true), 'dev');
});

test('resolveUiVariant: falls back to prod in non-development environment', () => {
  assert.equal(resolveUiVariant('', false), 'prod');
  assert.equal(resolveUiVariant('unknown', false), 'prod');
});
