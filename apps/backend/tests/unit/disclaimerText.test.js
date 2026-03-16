// tests/unit/disclaimerText.test.js
//
// Unit tests for Step 6 disclaimer text utility.
// Covers variant selection and text output.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('getDisclaimerText — standard variant contains jurisdiction language', () => {
  const { getDisclaimerText } = require('../../dist/homeRenovationAdvisor/engine/disclaimer/disclaimerText');
  const text = getDisclaimerText('standard');
  assert.ok(text.length > 50, 'standard disclaimer should be non-trivial');
  assert.ok(text.includes('jurisdiction'), 'standard disclaimer should mention jurisdiction');
});

test('getDisclaimerText — retroactive variant contains legal advice disclaimer', () => {
  const { getDisclaimerText } = require('../../dist/homeRenovationAdvisor/engine/disclaimer/disclaimerText');
  const text = getDisclaimerText('retroactive');
  assert.ok(text.includes('legal') || text.includes('advice'), 'retroactive disclaimer should mention legal/advice');
});

test('getDisclaimerText — unsupported_area variant mentions national defaults', () => {
  const { getDisclaimerText } = require('../../dist/homeRenovationAdvisor/engine/disclaimer/disclaimerText');
  const text = getDisclaimerText('unsupported_area');
  assert.ok(text.includes('national'), 'unsupported_area disclaimer should mention national defaults');
});

test('getDisclaimerText — low_confidence variant mentions fallback rules', () => {
  const { getDisclaimerText } = require('../../dist/homeRenovationAdvisor/engine/disclaimer/disclaimerText');
  const text = getDisclaimerText('low_confidence');
  assert.ok(text.includes('fallback'), 'low_confidence disclaimer should mention fallback');
});

test('selectDisclaimerVariant — unsupportedArea takes priority over retroactive', () => {
  const { selectDisclaimerVariant } = require('../../dist/homeRenovationAdvisor/engine/disclaimer/disclaimerText');
  const variant = selectDisclaimerVariant(true, true, false);
  assert.equal(variant, 'unsupported_area');
});

test('selectDisclaimerVariant — retroactive takes priority over low_confidence', () => {
  const { selectDisclaimerVariant } = require('../../dist/homeRenovationAdvisor/engine/disclaimer/disclaimerText');
  const variant = selectDisclaimerVariant(true, false, true);
  assert.equal(variant, 'retroactive');
});

test('selectDisclaimerVariant — low_confidence when no other flags', () => {
  const { selectDisclaimerVariant } = require('../../dist/homeRenovationAdvisor/engine/disclaimer/disclaimerText');
  const variant = selectDisclaimerVariant(false, false, true);
  assert.equal(variant, 'low_confidence');
});

test('selectDisclaimerVariant — standard when no flags set', () => {
  const { selectDisclaimerVariant } = require('../../dist/homeRenovationAdvisor/engine/disclaimer/disclaimerText');
  const variant = selectDisclaimerVariant(false, false, false);
  assert.equal(variant, 'standard');
});

test('DISCLAIMER_VERSION is a semver string', () => {
  const { DISCLAIMER_VERSION } = require('../../dist/homeRenovationAdvisor/engine/disclaimer/disclaimerText');
  assert.match(DISCLAIMER_VERSION, /^\d+\.\d+\.\d+$/, 'version should be semver');
});
