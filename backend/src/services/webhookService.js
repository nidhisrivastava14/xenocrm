// ─────────────────────────────────────────────────────────────
// src/services/webhookService.js
// Webhook processing — updates messages + recalculates stats
// ─────────────────────────────────────────────────────────────

const { pool } = require('./database');

// Valid event types from simulator
const VALID_EVENTS = ['sent', 'delivered', 'opened', 'clicked', 'failed', 'read'];

// Status progression order
const STATUS_ORDER = {
  pending:   0,
  sent:      1,
  delivered: 2,
  opened:    3,
  clicked:   4,
  failed:    1,
};

// Map event_type to database column names
const TIMESTAMP_COLUMNS = {
  sent:      'sent_at',
  delivered: 'delivered_at',
  opened:    'opened_at',
  clicked:   'clicked_at',
  failed:    'sent_at',
  read:      'opened_at', // WhatsApp read maps to opened_at
};

/**
 * Validates webhook payload.
 */
function validateWebhookInput(data) {
  const errors = [];

  if (!data.campaign_id) errors.push('campaign_id is required');
  if (!data.customer_id) errors.push('customer_id is required');

  if (!data.event_type) {
    errors.push('event_type is required');
  } else if (!VALID_EVENTS.includes(data.event_type)) {
    errors.push(`event_type must be one of: ${VALID_EVENTS.join(', ')}`);
  }

  return errors.length > 0
    ? { valid: false, errors }
    : { valid: true };
}

/**
 * Updates a single message record's status and timestamp.
 * Handles idempotency and channel-specific status rules.
 */
async function updateMessageStatus(client, campaignId, customerId, eventType, timestamp, messageId = null, channel = null) {
  // Map 'read' event to 'opened' status
  const finalStatus = eventType === 'read' ? 'opened' : eventType;

  // 1. Fetch current status and timestamps
  let current;
  if (messageId && pool) {
    current = await client.query(
      `SELECT id, status, sent_at, delivered_at, channel_specific_data FROM messages WHERE id = $1 LIMIT 1`,
      [messageId]
    );
  } else {
    current = await client.query(
      `SELECT id, status, sent_at, delivered_at, channel_specific_data FROM messages
       WHERE campaign_id = $1 AND customer_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [campaignId, customerId]
    );
  }

  if (current.rows.length === 0) {
    return { updated: false, skipped: true, reason: 'Message record not found' };
  }

  const msgRow = current.rows[0];
  const currentStatus = msgRow.status;
  const currentOrder  = STATUS_ORDER[currentStatus] ?? 0;
  const newOrder      = STATUS_ORDER[finalStatus] ?? 0;

  // Idempotency: skip if new status order is lower than current status
  if (finalStatus !== 'failed' && newOrder <= currentOrder) {
    return {
      updated: false,
      skipped: true,
      reason: `Already at status "${currentStatus}" (ignoring "${finalStatus}")`,
    };
  }

  // WhatsApp Read Constraint: WhatsApp read event requires status to be 'delivered'
  if (eventType === 'read' && channel === 'whatsapp' && currentStatus !== 'delivered') {
    return {
      updated: false,
      skipped: true,
      reason: `WhatsApp 'read' event ignored: status is currently "${currentStatus}" (expected "delivered")`,
    };
  }

  const tsCol = TIMESTAMP_COLUMNS[eventType];
  const ts = timestamp || new Date().toISOString();

  // Email time-to-open calculation
  let timeToOpenSeconds = null;
  const channelSpecificData = msgRow.channel_specific_data || {};

  if (finalStatus === 'opened' && channel === 'email') {
    const sentAt = msgRow.sent_at;
    if (sentAt) {
      const sentTime = new Date(sentAt).getTime();
      const openTime = new Date(ts).getTime();
      if (openTime >= sentTime) {
        timeToOpenSeconds = Math.round((openTime - sentTime) / 1000);
        channelSpecificData.time_to_open_seconds = timeToOpenSeconds;
      }
    }
  }

  // Perform the update
  await client.query(
    `UPDATE messages
     SET status = $1::message_status, ${tsCol} = $2, channel_specific_data = $3
     WHERE id = $4`,
    [finalStatus, ts, JSON.stringify(channelSpecificData), msgRow.id]
  );

  return { updated: true, skipped: false };
}

/**
 * Recalculates stats by counting actual message rows.
 */
async function recalculateStats(client, campaignId) {
  const result = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('sent','delivered','opened','clicked','failed'))  AS total_sent,
       COUNT(*) FILTER (WHERE status IN ('delivered','opened','clicked'))                  AS total_delivered,
       COUNT(*) FILTER (WHERE status IN ('opened','clicked'))                              AS total_opened,
       COUNT(*) FILTER (WHERE status = 'clicked')                                          AS total_clicked,
       COUNT(*) FILTER (WHERE status = 'failed')                                           AS total_failed
     FROM messages
     WHERE campaign_id = $1`,
    [campaignId]
  );

  const channelResult = await client.query(
    `SELECT
       channel,
       COUNT(*) FILTER (WHERE status IN ('sent','delivered','opened','clicked','failed'))  AS total_sent,
       COUNT(*) FILTER (WHERE status IN ('delivered','opened','clicked'))                  AS total_delivered,
       COUNT(*) FILTER (WHERE status IN ('opened','clicked'))                              AS total_opened,
       COUNT(*) FILTER (WHERE status = 'clicked')                                          AS total_clicked,
       COUNT(*) FILTER (WHERE status = 'failed')                                           AS total_failed
     FROM messages
     WHERE campaign_id = $1
     GROUP BY channel`,
    [campaignId]
  );

  const stats = {
    total_sent:      parseInt(result.rows[0].total_sent)      || 0,
    total_delivered: parseInt(result.rows[0].total_delivered)  || 0,
    total_opened:    parseInt(result.rows[0].total_opened)     || 0,
    total_clicked:   parseInt(result.rows[0].total_clicked)    || 0,
    total_failed:    parseInt(result.rows[0].total_failed)     || 0,
    by_channel: {}
  };

  channelResult.rows.forEach(row => {
    stats.by_channel[row.channel] = {
      total_sent:      parseInt(row.total_sent)      || 0,
      total_delivered: parseInt(row.total_delivered)  || 0,
      total_opened:    parseInt(row.total_opened)     || 0,
      total_clicked:   parseInt(row.total_clicked)    || 0,
      total_failed:    parseInt(row.total_failed)     || 0,
    };
  });

  await client.query(
    `UPDATE campaign_stats
     SET total_sent      = $1,
         total_delivered  = $2,
         total_opened     = $3,
         total_clicked    = $4,
         updated_at       = NOW()
     WHERE campaign_id = $5`,
    [stats.total_sent, stats.total_delivered, stats.total_opened, stats.total_clicked, campaignId]
  );

  return stats;
}

// In-memory stats store for mock mode
const mockStatsStore = new Map();

/**
 * Processes a single delivery event.
 */
async function processChannelEvent(eventData) {
  const { campaign_id, customer_id, event_type, timestamp, message_id, channel } = eventData;
  const finalStatus = event_type === 'read' ? 'opened' : event_type;

  if (!pool) {
    let stats = mockStatsStore.get(campaign_id);
    if (!stats) {
      stats = {
        total_sent: 0,
        total_delivered: 0,
        total_opened: 0,
        total_clicked: 0,
        total_failed: 0,
        sent_customers: new Set(),
        delivered_customers: new Set(),
        opened_customers: new Set(),
        clicked_customers: new Set(),
        failed_customers: new Set(),
        time_to_open_seconds: null,
        by_channel: {
          sms: { total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0, total_failed: 0 },
          whatsapp: { total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0, total_failed: 0 },
          email: { total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0, total_failed: 0 },
          rcs: { total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0, total_failed: 0 },
        }
      };
      mockStatsStore.set(campaign_id, stats);
    }
    
    let processed = false;
    let skipped = true;
    let reason = 'Already processed';

    // Unique tracking key (message_id is unique for split parts)
    const trackingKey = message_id || customer_id;
    const finalChannel = (channel || 'email').toLowerCase();

    if (!stats.by_channel[finalChannel]) {
      stats.by_channel[finalChannel] = { total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0, total_failed: 0 };
    }

    // Simulate WhatsApp Read Progression
    const isWhatsAppRead = event_type === 'read' && finalChannel === 'whatsapp';
    const hasDelivered = stats.delivered_customers.has(trackingKey);

    if (isWhatsAppRead && !hasDelivered) {
      reason = `WhatsApp 'read' event ignored: status is not 'delivered'`;
    } else {
      if (event_type === 'sent') {
        if (!stats.sent_customers.has(trackingKey)) {
          stats.sent_customers.add(trackingKey);
          stats.total_sent++;
          stats.by_channel[finalChannel].total_sent++;
          processed = true;
          skipped = false;
        }
      } else if (finalStatus === 'delivered' && !stats.delivered_customers.has(trackingKey)) {
        stats.delivered_customers.add(trackingKey);
        stats.total_delivered++;
        stats.by_channel[finalChannel].total_delivered++;
        processed = true;
        skipped = false;
      } else if (finalStatus === 'opened' && !stats.opened_customers.has(trackingKey)) {
        stats.opened_customers.add(trackingKey);
        stats.total_opened++;
        stats.by_channel[finalChannel].total_opened++;
        processed = true;
        skipped = false;

        // Email opened calculation
        if (finalChannel === 'email') {
          stats.time_to_open_seconds = 12; // simulated 12s time to open
        }
      } else if (finalStatus === 'clicked' && !stats.clicked_customers.has(trackingKey)) {
        stats.clicked_customers.add(trackingKey);
        stats.total_clicked++;
        stats.by_channel[finalChannel].total_clicked++;
        processed = true;
        skipped = false;
      } else if (finalStatus === 'failed' && !stats.failed_customers.has(trackingKey)) {
        stats.failed_customers.add(trackingKey);
        stats.total_failed++;
        stats.by_channel[finalChannel].total_failed++;
        processed = true;
        skipped = false;
      }
    }

    const returnStats = {
      total_sent: stats.total_sent,
      total_delivered: stats.total_delivered,
      total_opened: stats.total_opened,
      total_clicked: stats.total_clicked,
      total_failed: stats.total_failed,
      time_to_open_seconds: stats.time_to_open_seconds,
      by_channel: {
        sms: { ...stats.by_channel.sms },
        whatsapp: { ...stats.by_channel.whatsapp },
        email: { ...stats.by_channel.email },
        rcs: { ...stats.by_channel.rcs },
      }
    };

    return {
      processed,
      skipped,
      reason: skipped ? reason : undefined,
      stats: returnStats,
    };
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updateResult = await updateMessageStatus(
      client, campaign_id, customer_id, event_type, timestamp, message_id, channel
    );

    if (updateResult.skipped) {
      await client.query('ROLLBACK');
      client.release();

      const statsResult = await pool.query(
        `SELECT total_sent, total_delivered, total_opened, total_clicked
         FROM campaign_stats WHERE campaign_id = $1`,
        [campaign_id]
      );

      const currentStats = statsResult.rows[0] || {
        total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0,
      };

      return {
        processed: false,
        skipped: true,
        reason: updateResult.reason,
        stats: currentStats,
      };
    }

    const stats = await recalculateStats(client, campaign_id);

    await client.query('COMMIT');

    return {
      processed: true,
      skipped: false,
      stats,
    };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  validateWebhookInput,
  processChannelEvent,
  mockStatsStore,
};
