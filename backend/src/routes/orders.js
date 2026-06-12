// ─────────────────────────────────────────────────────────────
// src/routes/orders.js
// Order API routes with attribution logic
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { pool, MOCK_CUSTOMERS } = require('../services/database');
const {
  attributeOrder,
  addMockOrder,
  getMockOrders,
  mockMessages,
} = require('../services/attributionService');

/**
 * Helper to validate a customer ID.
 */
async function customerExists(customerId, client = null) {
  if (!pool) {
    return MOCK_CUSTOMERS.some(c => String(c.id) === String(customerId));
  }
  // Validate UUID format before database query to avoid raw SQL errors
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(customerId)) {
    return false;
  }
  const db = client || pool;
  const res = await db.query('SELECT id FROM customers WHERE id = $1', [customerId]);
  return res.rows.length > 0;
}

/**
 * POST /api/orders
 * Creates a customer order and runs attribution logic to link it to a message/campaign.
 */
router.post('/', async (req, res, next) => {
  try {
    const { customer_id, amount, order_date, idempotency_key, product = 'Attributed Sale' } = req.body;

    // 1. Amount validation (synchronous memory check)
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be a numeric value greater than 0' });
    }

    // 2. Order Date validation (synchronous memory check)
    const now = new Date();
    const orderDate = order_date ? new Date(order_date) : now;
    if (isNaN(orderDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid order date format' });
    }
    if (orderDate.getTime() > now.getTime() + 5000) { // 5s grace period for clock drift
      return res.status(400).json({ success: false, error: 'Order date cannot be in the future' });
    }

    // 3. Idempotency Check (early return before customer DB queries/locks)
    if (idempotency_key) {
      if (!pool) {
        const existingMock = getMockOrders().find(o => o.idempotency_key === idempotency_key);
        if (existingMock) {
          console.log(`[IDEMPOTENCY] Returning existing mock order for key: ${idempotency_key}`);
          return res.json({
            success: true,
            order_id: existingMock.id,
            attributed_campaign_id: existingMock.attributed_campaign_id,
            attribution_type: existingMock.attributed_campaign_id ? 'attributed' : 'organic',
          });
        }
      } else {
        const existingDb = await pool.query(
          'SELECT id, attributed_campaign_id, attributed_message_id FROM orders WHERE idempotency_key = $1',
          [idempotency_key]
        );
        if (existingDb.rows.length > 0) {
          const row = existingDb.rows[0];
          console.log(`[IDEMPOTENCY] Returning existing DB order for key: ${idempotency_key}`);
          return res.json({
            success: true,
            order_id: row.id,
            attributed_campaign_id: row.attributed_campaign_id,
            attribution_type: row.attributed_campaign_id ? 'attributed' : 'organic',
          });
        }
      }
    }

    // 4. Customer validation (after idempotency check, preventing unnecessary DB queries)
    const exists = await customerExists(customer_id);
    if (!exists) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    // 5. Attribution and Insert Logic
    if (!pool) {
      // Mock Mode Attribution
      const attr = await attributeOrder(customer_id, parsedAmount, orderDate);
      const newOrder = {
        id: `ord-${Math.random().toString(36).substring(2, 10)}`,
        customer_id,
        amount: parsedAmount,
        order_date: orderDate,
        attributed_campaign_id: attr.campaign_id,
        attributed_message_id: attr.message_id,
        attribution_window_hours: 48,
        attribution_method: 'last_touch',
        idempotency_key: idempotency_key || null,
      };
      addMockOrder(newOrder);

      if (attr.attributed && attr.campaign_id) {
        const io = req.app.get('io');
        if (io) {
          io.to(`campaign:${attr.campaign_id}`).emit('stats_update', {
            campaign_id: attr.campaign_id,
            event_type: 'order_attributed',
            customer_id,
            timestamp: orderDate.toISOString(),
            stats: {
              amount: parsedAmount,
              message_id: attr.message_id
            }
          });
        }
      }

      return res.json({
        success: true,
        order_id: newOrder.id,
        attributed_campaign_id: newOrder.attributed_campaign_id,
        attribution_type: attr.attribution_type,
      });
    }

    // DB Mode: Atomic Transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Double-check customer exists inside the transaction lock
      const lockRes = await client.query('SELECT id FROM customers WHERE id = $1 FOR SHARE', [customer_id]);
      if (lockRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Customer not found' });
      }

      let attr = { attributed: false, campaign_id: null, message_id: null, attribution_type: 'organic' };
      
      // Use savepoint so a failure in attributeOrder does not abort the entire transaction
      await client.query('SAVEPOINT before_attribution');
      try {
        attr = await attributeOrder(customer_id, parsedAmount, orderDate, 48, client);
        await client.query('RELEASE SAVEPOINT before_attribution');
      } catch (attrErr) {
        console.error('[ATTRIBUTION ERROR] Failed to compute attribution, falling back to organic:', attrErr.message);
        await client.query('ROLLBACK TO SAVEPOINT before_attribution');
        attr = { attributed: false, campaign_id: null, message_id: null, attribution_type: 'organic' };
      }

      const insertRes = await client.query(
        `INSERT INTO orders (
          customer_id, amount, product, order_date,
          attributed_campaign_id, attributed_message_id,
          attribution_window_hours, attribution_method, idempotency_key
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::attribution_method_type, $9)
        RETURNING id`,
        [
          customer_id,
          parsedAmount,
          product,
          orderDate,
          attr.campaign_id,
          attr.message_id,
          48,
          'last_touch',
          idempotency_key || null,
        ]
      );

      await client.query('COMMIT');

      if (attr.attributed && attr.campaign_id) {
        const io = req.app.get('io');
        if (io) {
          io.to(`campaign:${attr.campaign_id}`).emit('stats_update', {
            campaign_id: attr.campaign_id,
            event_type: 'order_attributed',
            customer_id,
            timestamp: orderDate.toISOString(),
            stats: {
              amount: parsedAmount,
              message_id: attr.message_id
            }
          });
        }
      }

      return res.json({
        success: true,
        order_id: insertRes.rows[0].id,
        attributed_campaign_id: attr.campaign_id,
        attribution_type: attr.attribution_type,
      });

    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

  } catch (err) {
    next(err); // Forward to global error handler
  }
});

/**
 * POST /api/orders/simulate-bulk
 * Seeding endpoint to generate N random orders for existing customers (60% attributed, 40% organic).
 */
router.post('/simulate-bulk', async (req, res, next) => {
  try {
    const { count = 20, campaign_id } = req.body;
    const parsedCount = parseInt(count);

    // Rate-limiting check
    if (isNaN(parsedCount) || parsedCount <= 0 || parsedCount > 50) {
      return res.status(400).json({ success: false, error: 'Count must be between 1 and 50' });
    }

    // Seed duplicate check
    if (campaign_id) {
      if (!pool) {
        const seededCount = getMockOrders().filter(o => o.attributed_campaign_id === campaign_id).length;
        if (seededCount > 0) {
          return res.status(400).json({
            success: false,
            error: 'Orders have already been simulated for this campaign. Re-seeding skipped to prevent duplicates.',
          });
        }
      } else {
        const checkDb = await pool.query(
          'SELECT COUNT(*) FROM orders WHERE attributed_campaign_id = $1',
          [campaign_id]
        );
        const countAttributed = parseInt(checkDb.rows[0].count);
        if (countAttributed > 0) {
          return res.status(400).json({
            success: false,
            error: 'Orders have already been simulated for this campaign. Re-seeding skipped to prevent duplicates.',
          });
        }
      }
    }

    // Resolve target customers to place orders
    let targetCustomers = [];
    if (!pool) {
      targetCustomers = MOCK_CUSTOMERS;
    } else {
      const dbCust = await pool.query('SELECT id FROM customers LIMIT 20');
      targetCustomers = dbCust.rows;
    }

    if (targetCustomers.length === 0) {
      return res.status(400).json({ success: false, error: 'No customers available in CRM to simulate orders' });
    }

    // Setup mock messages array in memory if in mock mode and campaign_id is provided
    if (!pool && campaign_id) {
      // Create some delivered/clicked mock messages for customers to attribute to
      targetCustomers.forEach((cust, index) => {
        // Create messages in the past 1-20 hours
        const sentAt = new Date(Date.now() - (index + 1) * 3600000);
        mockMessages.push({
          id: `msg-sim-${campaign_id}-${cust.id}`,
          campaign_id,
          customer_id: cust.id,
          status: index % 2 === 0 ? 'clicked' : 'delivered',
          sent_at: sentAt,
        });
      });
    }

    let insertedCount = 0;
    const now = Date.now();

    for (let i = 0; i < parsedCount; i++) {
      const customer = targetCustomers[i % targetCustomers.length];
      const isAttributed = i < Math.floor(parsedCount * 0.6); // 60% attributed

      const amount = Math.floor(Math.random() * 4500) + 500; // ₹500 - ₹5000
      let orderDate = new Date(now - Math.random() * 48 * 3600000); // random within 48h
      const idempotencyKey = `sim-bulk-${campaign_id || 'general'}-${customer.id}-${i}-${now}`;

      if (isAttributed && campaign_id) {
        // Make sure it places within the window by matching a sent message time
        if (pool) {
          // Find the sent message in DB
          const msgRes = await pool.query(
            `SELECT id, sent_at FROM messages WHERE campaign_id = $1 AND customer_id = $2 AND status IN ('delivered', 'opened', 'clicked') LIMIT 1`,
            [campaign_id, customer.id]
          );
          if (msgRes.rows.length > 0) {
            const msg = msgRes.rows[0];
            orderDate = new Date(new Date(msg.sent_at).getTime() + Math.random() * 4 * 3600000); // 1-4 hours after message
          }
        } else {
          // Mock Mode: Find matching message
          const msg = mockMessages.find(m => m.campaign_id === campaign_id && m.customer_id === customer.id);
          if (msg) {
            orderDate = new Date(new Date(msg.sent_at).getTime() + Math.random() * 4 * 3600000);
          }
        }
      }

      // Call API insertion logic directly or emulate
      if (!pool) {
        const attr = await attributeOrder(customer.id, amount, orderDate);
        addMockOrder({
          customer_id: customer.id,
          amount,
          order_date: orderDate,
          attributed_campaign_id: attr.campaign_id,
          attributed_message_id: attr.message_id,
          idempotency_key: idempotencyKey,
        });
        insertedCount++;
      } else {
        // DB Insertion
        try {
          const attr = await attributeOrder(customer.id, amount, orderDate);
          await pool.query(
            `INSERT INTO orders (customer_id, amount, product, order_date, attributed_campaign_id, attributed_message_id, idempotency_key)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [customer.id, amount, 'Simulated Purchase', orderDate, attr.campaign_id, attr.message_id, idempotencyKey]
          );
          insertedCount++;
        } catch (dbErr) {
          console.error('[SIMULATE BULK DB ERROR]', dbErr.message);
        }
      }
    }

    return res.json({
      success: true,
      message: `Successfully simulated ${insertedCount} orders`,
      seeded_orders_count: insertedCount,
    });

  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders
 * Returns list of orders.
 */
router.get('/', async (req, res, next) => {
  try {
    if (!pool) {
      return res.json({ success: true, count: getMockOrders().length, orders: getMockOrders() });
    }
    const result = await pool.query('SELECT * FROM orders ORDER BY order_date DESC');
    return res.json({ success: true, count: result.rows.length, orders: result.rows });
  } catch (err) {
    next(err);
  }
});

// Local error-handling middleware for orders routes to prevent raw error/stack leaks
router.use((err, req, res, next) => {
  console.error('💥 Orders API error:', err);
  res.status(500).json({
    success: false,
    error: 'Something went wrong, please try again',
  });
});

module.exports = router;
