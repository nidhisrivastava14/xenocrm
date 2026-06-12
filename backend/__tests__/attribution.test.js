// ─────────────────────────────────────────────────────────────
// backend/__tests__/attribution.test.js
// Integration and Unit Tests for Order Attribution
// ─────────────────────────────────────────────────────────────

const assert = require('assert').strict;
const http = require('http');

// Force mock mode for testing reliability without DB dependency
process.env.DATABASE_URL = '';
// Prevent port conflicts with running dev server by listening on a random port
process.env.PORT = '0';

const app = require('../src/index');
const {
  attributeOrder,
  clearMockData,
  addMockMessage,
  addMockOrder,
  getMockOrders,
} = require('../src/services/attributionService');

let server;
let port;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      port = server.address().port;
      console.log(`🧪 Test server started on port ${port}`);
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    server.close(() => {
      console.log('🧪 Test server stopped');
      resolve();
    });
  });
}

// Helper for making API requests in tests
async function apiRequest(method, path, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(`http://localhost:${port}${path}`, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: JSON.parse(data)
        });
      });
    });

    req.on('error', err => reject(err));
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Test cases
async function runTests() {
  console.log('\n🧪 [ATTRIBUTION TESTS] Starting attribution test suite...');

  // ── Service Level Tests ─────────────────────────────────────
  
  // Test 1: Order within 48h window is attributed correctly
  clearMockData();
  const customerId = 1; // Pri Sharma (valid mock customer ID)
  const campaignId = 'camp-wa-1';
  const messageId = 'msg-1';
  
  addMockMessage({
    id: messageId,
    campaign_id: campaignId,
    customer_id: customerId,
    status: 'clicked',
    sent_at: new Date(Date.now() - 2 * 3600000) // 2h ago
  });

  const res1 = await attributeOrder(customerId, 1000, new Date());
  assert.equal(res1.attributed, true);
  assert.equal(res1.campaign_id, campaignId);
  assert.equal(res1.message_id, messageId);
  assert.equal(res1.attribution_type, 'clicked');
  console.log('  ✅ Service: Attributed correct clicked message in 48h');

  // Test 2: Order with no prior messages -> organic
  clearMockData();
  const res2 = await attributeOrder(customerId, 1000, new Date());
  assert.equal(res2.attributed, false);
  assert.equal(res2.campaign_id, null);
  assert.equal(res2.attribution_type, 'organic');
  console.log('  ✅ Service: Attributed organic correctly when no messages exist');

  // Test 3: Last touch attribution (picks latest message)
  clearMockData();
  addMockMessage({
    id: 'msg-older',
    campaign_id: 'camp-older',
    customer_id: customerId,
    status: 'opened',
    sent_at: new Date(Date.now() - 10 * 3600000) // 10h ago
  });
  addMockMessage({
    id: 'msg-newer',
    campaign_id: 'camp-newer',
    customer_id: customerId,
    status: 'delivered',
    sent_at: new Date(Date.now() - 1 * 3600000) // 1h ago
  });

  const res3 = await attributeOrder(customerId, 1500, new Date());
  assert.equal(res3.attributed, true);
  assert.equal(res3.campaign_id, 'camp-newer');
  assert.equal(res3.message_id, 'msg-newer');
  assert.equal(res3.attribution_type, 'delivered');
  console.log('  ✅ Service: Picks latest qualifying message (last-touch)');

  // Test 4: Order outside 48hr window -> organic
  clearMockData();
  addMockMessage({
    id: 'msg-out',
    campaign_id: 'camp-out',
    customer_id: customerId,
    status: 'clicked',
    sent_at: new Date(Date.now() - 50 * 3600000) // 50h ago
  });

  const res4 = await attributeOrder(customerId, 1200, new Date());
  assert.equal(res4.attributed, false);
  assert.equal(res4.campaign_id, null);
  assert.equal(res4.attribution_type, 'organic');
  console.log('  ✅ Service: Ignores messages outside the 48-hour window');


  // ── HTTP API Endpoint Level Tests ──────────────────────────
  
  // Test 5: Order validation (customer_id not found -> 404)
  const apiRes1 = await apiRequest('POST', '/api/orders', {
    customer_id: 'db48c1fb-0000-0000-0000-000000000000', // Valid UUID format but non-existent
    amount: 1500
  });
  assert.equal(apiRes1.status, 404);
  assert.equal(apiRes1.body.error, 'Customer not found');
  console.log('  ✅ API: Order rejected with 404 for non-existent customer_id');

  // Test 5.1: Order validation (customer_id invalid UUID format -> 404)
  const apiRes1_invalid = await apiRequest('POST', '/api/orders', {
    customer_id: 'non-existent-id-not-uuid',
    amount: 1500
  });
  assert.equal(apiRes1_invalid.status, 404);
  assert.equal(apiRes1_invalid.body.error, 'Customer not found');
  console.log('  ✅ API: Order rejected with 404 for invalid UUID format customer_id');

  // Test 6: Order validation (amount = 0 or negative -> 400)
  const apiRes2 = await apiRequest('POST', '/api/orders', {
    customer_id: 1, // Priya Sharma (valid mock customer ID)
    amount: 0
  });
  assert.equal(apiRes2.status, 400);
  assert.ok(apiRes2.body.error.includes('Amount must be'));
  console.log('  ✅ API: Order rejected with 400 for amount = 0');

  const apiRes3 = await apiRequest('POST', '/api/orders', {
    customer_id: 1,
    amount: -100
  });
  assert.equal(apiRes3.status, 400);
  console.log('  ✅ API: Order rejected with 400 for negative amount');

  // Test 7: Idempotency check (duplicate key returns existing order)
  clearMockData();
  const idempotencyKey = 'test-idemp-123';
  const apiRes4 = await apiRequest('POST', '/api/orders', {
    customer_id: 1,
    amount: 500,
    idempotency_key: idempotencyKey
  });
  assert.equal(apiRes4.status, 200);
  const originalOrderId = apiRes4.body.order_id;

  // Make the call again with same idempotency key
  const apiRes5 = await apiRequest('POST', '/api/orders', {
    customer_id: 1,
    amount: 1000, // different amount but should be ignored
    idempotency_key: idempotencyKey
  });
  assert.equal(apiRes5.status, 200);
  assert.equal(apiRes5.body.order_id, originalOrderId);
  
  // Check mockOrders store to ensure only ONE order row was created
  assert.equal(getMockOrders().length, 1);
  console.log('  ✅ API: Idempotent order creation works (no duplicates)');

  // Test 8: Analytics for campaign with 0 sent/0 orders -> returns zeros
  const { mockStatsStore } = require('../src/services/webhookService');
  mockStatsStore.set('empty-campaign', {
    total_sent: 0,
    total_delivered: 0,
    total_opened: 0,
    total_clicked: 0,
    total_failed: 0,
  });

  const apiRes7 = await apiRequest('GET', '/api/campaigns/empty-campaign/analytics');
  assert.equal(apiRes7.status, 200);
  assert.equal(apiRes7.body.revenue.attributed_orders, 0);
  assert.equal(apiRes7.body.revenue.attributed_revenue, 0);
  assert.equal(apiRes7.body.revenue.avg_order_value, 0);
  assert.equal(apiRes7.body.revenue.revenue_per_message, 0);
  assert.equal(apiRes7.body.revenue.conversion_rate, '0/0 = 0%');
  console.log('  ✅ API: Analytics endpoint returns zeroed-out stats for empty campaign (no NaNs)');

  console.log('\n🎉 ALL ATTRIBUTION TESTS PASSED SUCCESSFULLY!');
}

async function run() {
  await startServer();
  try {
    await runTests();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test assertion failed:', err);
    process.exit(1);
  } finally {
    await stopServer();
  }
}

run();
