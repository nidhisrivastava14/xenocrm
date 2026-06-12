// ─────────────────────────────────────────────────────────────
// src/services/campaignService.js
// Campaign orchestration — DB transactions + Channel Service call
// ─────────────────────────────────────────────────────────────

const { pool, MOCK_CUSTOMERS, MOCK_CAMPAIGNS } = require('./database');
const { queueCampaignMessages } = require('./campaignQueue');

// Channel Service URL (separate Node service on port 5001)
const CHANNEL_SERVICE_URL = process.env.CHANNEL_SERVICE_URL || 'http://localhost:5001';

// ──────────────────────────────────────────────────────────────
// 1. CREATE CAMPAIGN (atomic DB transaction)
// ──────────────────────────────────────────────────────────────

/**
 * Creates a campaign + all per-customer message records + stats row.
 * Everything is wrapped in a single transaction — all or nothing.
 *
 * @param {Object} params
 * @param {string} params.segment_name
 * @param {string} params.persona
 * @param {string} params.message
 * @param {string} params.channel
 * @param {string[]} params.customer_ids - Array of customer UUIDs
 * @returns {Object} { campaignId, totalMessages, customerPhones, dispatches }
 */
async function createCampaign({ segment_name, persona, message, channel, customer_ids }) {
  if (!pool) {
    console.log(`\n📨 [MOCK MODE] Creating campaign: "${segment_name}" via preferred: ${channel}`);
    const campaignId = 'mock-' + Math.random().toString(36).substring(2, 15);
    const createdAt = new Date().toISOString();
    
    // Resolve mock customers for the IDs passed in
    const resolvedIds = (customer_ids && customer_ids.length > 0) ? customer_ids : [1, 2, 3, 4, 5];
    const targetCustomers = resolvedIds.map(id => {
      return MOCK_CUSTOMERS.find(c => c.id === id || String(c.id) === String(id)) || MOCK_CUSTOMERS[0];
    });

    // Queue messages (mock mode creates mock dispatches)
    const dispatches = await queueCampaignMessages(null, campaignId, targetCustomers, message, persona);
    
    console.log(`  ✓ [MOCK] Resolved ${dispatches.length} multi-channel mock customer messages`);
    console.log(`  ✅ [MOCK] Mock Campaign created: ${campaignId}`);

    // Track mock campaign in memory list
    if (MOCK_CAMPAIGNS) {
      MOCK_CAMPAIGNS.push({
        id: campaignId,
        segment_name,
        message,
        channel,
        status: 'sending',
        created_at: createdAt
      });
    }

    // Store in mock stats store
    const { mockStatsStore } = require('./webhookService');
    mockStatsStore.set(campaignId, {
      total_sent: dispatches.length,
      total_delivered: 0,
      total_opened: 0,
      total_clicked: 0,
      total_failed: 0,
      delivered_customers: new Set(),
      opened_customers: new Set(),
      clicked_customers: new Set(),
      failed_customers: new Set(),
    });

    return {
      campaignId,
      createdAt,
      totalMessages: dispatches.length,
      customerPhones: dispatches.map(d => ({ id: d.customer_id, phone: d.phone, email: d.email, channel: d.channel })),
      dispatches,
    };
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── Step 1: Insert campaign record ────────────────────────
    console.log(`\n📨 Creating campaign: "${segment_name}" via preferred: ${channel}`);

    const campaignResult = await client.query(
      `INSERT INTO campaigns (segment_name, message, channel, status)
       VALUES ($1, $2, $3, 'sending')
       RETURNING id, created_at`,
      [segment_name, message, channel]
    );

    const campaignId = campaignResult.rows[0].id;
    const createdAt  = campaignResult.rows[0].created_at;
    console.log(`  ✓ Campaign created: ${campaignId}`);

    // ── Step 2: Fetch target customers details ────────────────
    const customerResult = await client.query(
      `SELECT id, name, email, phone FROM customers WHERE id = ANY($1::uuid[])`,
      [customer_ids]
    );

    const targetCustomers = customerResult.rows;
    console.log(`  ✓ Resolved ${targetCustomers.length} customer records`);

    // ── Step 3: Queue messages (Router, Formatter, SQL batch) ──
    const dispatches = await queueCampaignMessages(client, campaignId, targetCustomers, message, persona);
    console.log(`  ✓ Queued ${dispatches.length} messages (including split parts)`);

    // ── Step 4: Initialize campaign_stats row ─────────────────
    await client.query(
      `INSERT INTO campaign_stats (campaign_id, total_sent, total_delivered, total_opened, total_clicked)
       VALUES ($1, $2, 0, 0, 0)`,
      [campaignId, dispatches.length]
    );

    console.log(`  ✓ Campaign stats initialized (sent: ${dispatches.length})`);

    // ── Commit transaction ────────────────────────────────────
    await client.query('COMMIT');
    console.log(`  ✅ Transaction committed`);

    return {
      campaignId,
      createdAt,
      totalMessages: dispatches.length,
      customerPhones: dispatches.map(d => ({ id: d.customer_id, phone: d.phone, email: d.email, channel: d.channel })),
      dispatches,
    };

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`  ❌ Transaction rolled back: ${err.message}`);
    throw err;
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────────────────────
// 2. BUILD CHANNEL SERVICE PAYLOAD
// ──────────────────────────────────────────────────────────────

/**
 * Builds the message payload for the Channel Service.
 *
 * @param {string} campaignId
 * @param {string} message - Unused since individual dispatches are already formatted
 * @param {string} channel - Preferred channel
 * @param {Object[]} dispatches - Array of prepared message dispatches
 * @returns {Object} Payload ready for POST /simulate
 */
function buildChannelPayload(campaignId, message, channel, dispatches) {
  return {
    campaign_id: campaignId,
    channel,
    callback_url: `${process.env.CRM_CALLBACK_URL || process.env.CRM_BASE_URL || 'http://localhost:3000'}/api/webhooks/channel-events`,
    messages: dispatches.map(d => ({
      message_id:  d.message_id,
      customer_id: d.customer_id,
      phone:       d.phone,
      email:       d.email,
      message:     d.message,
      channel:     d.channel,
    })),
  };
}

// ──────────────────────────────────────────────────────────────
// 3. CALL CHANNEL SERVICE (fire-and-forget)
// ──────────────────────────────────────────────────────────────

/**
 * Sends the campaign payload to the Channel Service for async delivery.
 *
 * @param {Object} payload - From buildChannelPayload()
 */
async function callChannelService(payload) {
  const url = `${CHANNEL_SERVICE_URL}/simulate`;

  console.log(`\n🔄 Calling Channel Service: POST ${url}`);
  console.log(`   Payload: ${payload.messages.length} messages for campaign ${payload.campaign_id}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Channel Service accepted: ${data.message || 'OK'}`);
    } else {
      console.warn(`   ⚠️  Channel Service returned ${response.status}`);
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn(`   ⚠️  Channel Service timeout (5s). Messages queued for retry.`);
    } else {
      console.warn(`   ⚠️  Channel Service unreachable: ${err.message}`);
      console.warn(`   ℹ️  Campaign ${payload.campaign_id} saved. Start Channel Service to process.`);
    }
  }
}

module.exports = {
  createCampaign,
  buildChannelPayload,
  callChannelService,
};
