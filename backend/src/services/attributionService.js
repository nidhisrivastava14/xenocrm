// ─────────────────────────────────────────────────────────────
// src/services/attributionService.js
// Order Attribution Service
// ─────────────────────────────────────────────────────────────

const { pool } = require('./database');

// In-memory data structures for mock mode (helps testing and demo mode without DB)
let mockMessages = [];
let mockOrders = [];

function initializeMockData() {
  if (mockMessages.length === 0) {
    // Seed messages and orders for mock campaigns
    
    // mock-campaign-1 (WhatsApp)
    for (let i = 0; i < 150; i++) {
      mockMessages.push({
        id: `m1-${i}`,
        campaign_id: 'mock-campaign-1',
        customer_id: (i % 5) + 1, // PRIYA, RAHUL, etc.
        status: i < 80 ? 'clicked' : (i < 120 ? 'opened' : 'delivered'),
        sent_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      });
    }
    // Seed orders for mock-campaign-1
    for (let i = 0; i < 15; i++) {
      mockOrders.push({
        id: `o1-${i}`,
        customer_id: (i % 5) + 1,
        amount: 3000, // 15 * 3000 = 45000
        order_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + i * 2 * 60 * 60 * 1000),
        attributed_campaign_id: 'mock-campaign-1',
        attributed_message_id: `m1-${i}`,
        idempotency_key: `mock-key-1-${i}`,
        attribution_window_hours: 48,
        attribution_method: 'last_touch'
      });
    }

    // mock-campaign-2 (Email)
    for (let i = 0; i < 200; i++) {
      mockMessages.push({
        id: `m2-${i}`,
        campaign_id: 'mock-campaign-2',
        customer_id: (i % 5) + 1,
        status: i < 40 ? 'clicked' : (i < 150 ? 'opened' : 'delivered'),
        sent_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      });
    }
    // Seed orders for mock-campaign-2
    for (let i = 0; i < 4; i++) {
      mockOrders.push({
        id: `o2-${i}`,
        customer_id: (i % 5) + 1,
        amount: 3000, // 4 * 3000 = 12000
        order_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + i * 4 * 60 * 60 * 1000),
        attributed_campaign_id: 'mock-campaign-2',
        attributed_message_id: `m2-${i}`,
        idempotency_key: `mock-key-2-${i}`,
        attribution_window_hours: 48,
        attribution_method: 'last_touch'
      });
    }

    // mock-campaign-3 (SMS)
    for (let i = 0; i < 80; i++) {
      mockMessages.push({
        id: `m3-${i}`,
        campaign_id: 'mock-campaign-3',
        customer_id: (i % 5) + 1,
        status: i < 10 ? 'clicked' : 'delivered',
        sent_at: new Date(Date.now() - 1 * 60 * 60 * 1000)
      });
    }

    // Seed organic orders
    for (let i = 0; i < 10; i++) {
      mockOrders.push({
        id: `org-${i}`,
        customer_id: (i % 5) + 1,
        amount: 2500, // 10 * 2500 = 25000 organic
        order_date: new Date(Date.now() - i * 12 * 60 * 60 * 1000),
        attributed_campaign_id: null,
        attributed_message_id: null,
        idempotency_key: `mock-key-org-${i}`,
        attribution_window_hours: 48,
        attribution_method: 'none'
      });
    }
  }
}

function clearMockData() {
  mockMessages = [];
  mockOrders = [];
}

initializeMockData();

function addMockMessage(msg) {
  mockMessages.push({
    id: msg.id || `msg-${Math.random().toString(36).substring(2, 10)}`,
    campaign_id: msg.campaign_id,
    customer_id: msg.customer_id,
    status: msg.status || 'delivered',
    sent_at: msg.sent_at ? new Date(msg.sent_at) : new Date(),
  });
}

function addMockOrder(order) {
  mockOrders.push({
    id: order.id || `ord-${Math.random().toString(36).substring(2, 10)}`,
    customer_id: order.customer_id,
    amount: parseFloat(order.amount),
    order_date: order.order_date ? new Date(order.order_date) : new Date(),
    attributed_campaign_id: order.attributed_campaign_id || null,
    attributed_message_id: order.attributed_message_id || null,
    attribution_window_hours: order.attribution_window_hours || 48,
    attribution_method: order.attribution_method || 'last_touch',
    idempotency_key: order.idempotency_key || null,
  });
}

function getMockOrders() {
  return mockOrders;
}

function getMockMessages() {
  return mockMessages;
}

/**
 * Attributes an order to the most recent campaign message sent to the customer
 * within the specified attribution window (default 48 hours) where the message was delivered/opened/clicked/read.
 * 
 * Returns attribution details.
 */
async function attributeOrder(customerId, amount, orderDateStr, customWindowHours = 48, dbClient = null) {
  const orderDate = orderDateStr ? new Date(orderDateStr) : new Date();
  const windowHours = parseInt(customWindowHours) || 48;

  // DB Mode
  if (pool) {
    const client = dbClient || pool;
    // We search for the latest message matching criteria
    // We lock the qualifying row with FOR UPDATE to prevent race conditions on simultaneous inserts.
    const query = `
      SELECT id, campaign_id, status, sent_at
      FROM messages
      WHERE customer_id = $1
        AND status IN ('delivered', 'opened', 'clicked')
        AND sent_at IS NOT NULL
        AND sent_at >= $2 - ($3 * INTERVAL '1 hour')
        AND sent_at <= $2
      ORDER BY sent_at DESC
      LIMIT 1
      FOR UPDATE
    `;
    const res = await client.query(query, [customerId, orderDate, windowHours]);
    if (res.rows.length > 0) {
      const msg = res.rows[0];
      let attributionType = 'delivered';
      if (msg.status === 'clicked') attributionType = 'clicked';
      else if (msg.status === 'opened') attributionType = 'opened';

      return {
        attributed: true,
        campaign_id: msg.campaign_id,
        message_id: msg.id,
        attribution_type: attributionType,
      };
    } else {
      return {
        attributed: false,
        campaign_id: null,
        message_id: null,
        attribution_type: 'organic',
      };
    }
  }

  // Mock Mode: Deterministic lookup over mockMessages array
  const matched = mockMessages.filter(msg => {
    const isSameCustomer = String(msg.customer_id) === String(customerId);
    const hasValidStatus = ['delivered', 'opened', 'clicked', 'read'].includes(msg.status);
    const sentTime = new Date(msg.sent_at).getTime();
    const orderTime = orderDate.getTime();
    const diffMs = orderTime - sentTime;
    const diffHours = diffMs / (1000 * 60 * 60);

    return isSameCustomer && hasValidStatus && diffMs >= 0 && diffHours <= windowHours;
  });

  if (matched.length > 0) {
    // Pick the one with the latest sent_at (last-touch)
    matched.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
    const msg = matched[0];
    let attributionType = 'delivered';
    if (msg.status === 'clicked') attributionType = 'clicked';
    else if (msg.status === 'opened' || msg.status === 'read') attributionType = 'opened';

    return {
      attributed: true,
      campaign_id: msg.campaign_id,
      message_id: msg.id,
      attribution_type: attributionType,
    };
  }

  return {
    attributed: false,
    campaign_id: null,
    message_id: null,
    attribution_type: 'organic',
  };
}

module.exports = {
  attributeOrder,
  mockMessages,
  mockOrders,
  clearMockData,
  addMockMessage,
  addMockOrder,
  getMockOrders,
  getMockMessages,
};
