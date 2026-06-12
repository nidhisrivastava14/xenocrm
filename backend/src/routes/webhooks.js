// ─────────────────────────────────────────────────────────────
// src/routes/webhooks.js
// POST /api/webhooks/channel-events
//
// Receives async delivery callbacks from the Channel Service.
// Each callback triggers:
//   1. Message status update (idempotent)
//   2. Campaign stats recalculation (COUNT-based, accurate)
//   3. WebSocket broadcast (live dashboard update)
//
// The Socket.io instance is attached to the Express app
// during server startup (see src/index.js).
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const {
  validateWebhookInput,
  processChannelEvent,
} = require('../services/webhookService');

/**
 * POST /api/webhooks/channel-events
 *
 * Called by the Channel Service for each delivery event.
 *
 * Input:
 *   {
 *     "campaign_id": "uuid",
 *     "customer_id": "uuid",
 *     "phone": "+91-XXXXXXXXXX",
 *     "event_type": "delivered",   // sent | delivered | opened | clicked | failed
 *     "timestamp": "2026-06-09T14:22:35Z"
 *   }
 *
 * Response:
 *   { "success": true, "event_type": "delivered", "stats": { ... } }
 */
router.post('/channel-events', async (req, res) => {
  try {
    // ── 1. Validate input ─────────────────────────────────────
    const validation = validateWebhookInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid webhook payload',
        details: validation.errors,
        required_fields: ['campaign_id', 'customer_id', 'event_type'],
      });
    }

    const { campaign_id, customer_id, event_type } = req.body;

    // ── 2. Process the event (update DB + recalculate stats) ──
    const result = await processChannelEvent(req.body);

    // ── 3. Log what happened ──────────────────────────────────
    if (result.skipped) {
      console.log(`📩 Webhook (skip): ${event_type.padEnd(9)} │ campaign: ${campaign_id.substring(0, 8)}… │ ${result.reason}`);
    } else {
      console.log(`📩 Webhook: ${event_type.padEnd(9)} │ campaign: ${campaign_id.substring(0, 8)}… │ 📊 D:${result.stats.total_delivered} O:${result.stats.total_opened} C:${result.stats.total_clicked}`);
    }

    // ── 4. Broadcast via WebSocket (if Socket.io is available) ─
    // The `io` instance is attached to `req.app` during server setup
    const io = req.app.get('io');
    if (io && result.stats) {
      io.emit('stats_update', {
        campaign_id,
        event_type,
        channel: req.body.channel || 'email',
        stats: {
          total_sent:      result.stats.total_sent,
          total_delivered:  result.stats.total_delivered,
          total_opened:     result.stats.total_opened,
          total_clicked:    result.stats.total_clicked,
          total_failed:     result.stats.total_failed || 0,
          time_to_open_seconds: result.stats.time_to_open_seconds || null,
          by_channel:       result.stats.by_channel || null,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // ── 5. Respond ────────────────────────────────────────────
    return res.json({
      success:    true,
      event_type,
      processed:  result.processed,
      skipped:    result.skipped,
      stats:      result.stats,
    });

  } catch (err) {
    console.error(`❌ Webhook error: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: 'Failed to process delivery event',
      detail: err.message,
    });
  }
});

module.exports = router;
