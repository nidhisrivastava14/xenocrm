// ─────────────────────────────────────────────────────────────
// src/services/channelSelection.test.js
// Unit tests for channel routing & fallback selection logic
// ─────────────────────────────────────────────────────────────

const assert = require('assert').strict;
const { selectChannelForSegment, validateAndSanitizePhone } = require('./channelRouter');

async function testPhoneSanitization() {
  console.log('🧪 Running Phone Sanitization tests...');

  // Valid formats
  assert.equal(validateAndSanitizePhone('+919876543210'), '+919876543210');
  assert.equal(validateAndSanitizePhone('+91-98765-43210'), '+919876543210');
  assert.equal(validateAndSanitizePhone('+1 555 123 4567'), '+15551234567');

  // Invalid formats
  assert.equal(validateAndSanitizePhone('9876543210'), null); // Missing leading +
  assert.equal(validateAndSanitizePhone('+91'), null);         // Too short
  assert.equal(validateAndSanitizePhone('not-a-number'), null);
  assert.equal(validateAndSanitizePhone(null), null);

  console.log('✅ Phone Sanitization tests passed!');
}

async function testChannelRouting() {
  console.log('\n🧪 Running Channel Routing & Fallback tests...');

  // Test 1: Segment 'high_value' (prefers WhatsApp) with both contacts
  const res1 = await selectChannelForSegment('high_value', '+919876543210', 'test@example.com');
  assert.ok(res1);
  assert.equal(res1.channel, 'whatsapp');
  assert.equal(res1.destination, '+919876543210');
  assert.equal(res1.priority, 'high');

  // Test 2: Segment 'high_value' with missing phone (falls back to Email)
  const res2 = await selectChannelForSegment('high_value', null, 'test@example.com');
  assert.ok(res2);
  assert.equal(res2.channel, 'email');
  assert.equal(res2.destination, 'test@example.com');
  assert.equal(res2.priority, 'normal');

  // Test 3: Segment 'at_risk' (prefers SMS) with both contacts
  const res3 = await selectChannelForSegment('at_risk', '+91-88888-88888', 'test@example.com');
  assert.ok(res3);
  assert.equal(res3.channel, 'sms');
  assert.equal(res3.destination, '+918888888888');

  // Test 4: Segment 'at_risk' with missing/invalid phone (falls back to Email)
  const res4 = await selectChannelForSegment('at_risk', 'invalid-phone', 'test@example.com');
  assert.ok(res4);
  assert.equal(res4.channel, 'email');
  assert.equal(res4.destination, 'test@example.com');

  // Test 5: Segment 'dormant' (prefers Email) with both contacts
  const res5 = await selectChannelForSegment('dormant', '+919876543210', 'test@example.com');
  assert.ok(res5);
  assert.equal(res5.channel, 'email');
  assert.equal(res5.destination, 'test@example.com');

  // Test 6: Segment 'dormant' with missing email (falls back to SMS)
  const res6 = await selectChannelForSegment('dormant', '+919876543210', null);
  assert.ok(res6);
  assert.equal(res6.channel, 'sms');
  assert.equal(res6.destination, '+919876543210');

  // Test 7: Customer has NEITHER phone nor email (SKIP - returns null)
  const res7 = await selectChannelForSegment('high_value', null, null);
  assert.equal(res7, null);

  // Test 8: Unknown segment name (should safely resolve rules default to email)
  const res8 = await selectChannelForSegment('unknown_persona', '+919876543210', 'test@example.com');
  assert.ok(res8);
  assert.equal(res8.channel, 'email');
  assert.equal(res8.destination, 'test@example.com');

  console.log('✅ Channel Routing & Fallback tests passed!');
}

async function runAll() {
  try {
    await testPhoneSanitization();
    await testChannelRouting();
    console.log('\n🎉 ALL UNIT TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('\n❌ Test execution failed with assertion error:');
    console.error(err);
    process.exit(1);
  }
}

runAll();
