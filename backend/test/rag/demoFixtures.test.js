import test from 'node:test';
import assert from 'node:assert/strict';
import { mockClassifyAndExtract } from '../../src/services/mockFixtures.js';

test('the renewed licence is recognised by file name with the new expiry', () => {
  for (const name of ['meera-iyer-renewed-drivers-license.png', 'meera-iyer-drivers-license-renewed.png', 'Meera-Iyer-Drivers-License-Renewed.PNG']) {
    const out = mockClassifyAndExtract(name);
    assert.equal(out.docType, 'drivers-license');
    assert.equal(out.fields.licenseExpiry, '04/30/2031');
    assert.equal(out.fields.fullName, 'Meera Iyer');
  }
  // the seeded, expired licence is untouched
  assert.equal(mockClassifyAndExtract('meera-iyer-drivers-license.png').fields.licenseExpiry, '04/30/2026');
});

test('the long demo statement is recognised as a bank statement, not "unknown"', () => {
  const out = mockClassifyAndExtract('jordan-rivera-long-bank-statement.pdf');
  assert.equal(out.docType, 'bank-statement');
  assert.ok(out.confidence >= 0.9);
  assert.equal(out.fields.fullName, 'Jordan Rivera');
});

test('an unrecognised file name still falls back to unknown', () => {
  assert.equal(mockClassifyAndExtract('some-random-scan.pdf').docType, 'unknown');
});
