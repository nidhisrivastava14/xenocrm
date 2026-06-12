// ─────────────────────────────────────────────────────────────
// src/routes/campaigns.js
// POST /api/campaigns/send — Dispatch a campaign to customers
//
// Orchestration flow:
//   1. Validate input
//   2. Create campaign + messages + stats in one transaction
//   3. Fire-and-forget call to Channel Service
//   4. Return campaign ID immediately (don't wait for delivery)
//
// The Channel Service will call back to /api/webhooks/channel-events
// as messages get delivered/opened/clicked.
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { pool, MOCK_CAMPAIGNS } = require('../services/database');
const { validateCampaignInput } = require('../services/validationService');
const {
  createCampaign,
  buildChannelPayload,
  callChannelService,
} = require('../services/campaignService');

/**
 * POST /api/campaigns/send
 *
 * Request body:
 *   {
 *     "segment_name": "Lapsed High-Value Shoppers",
 *     "persona": "Lapsed High-Value",
 *     "message": "Hey! Winter collection is almost sold out...",
 *     "channel": "whatsapp",
 *     "customer_ids": ["uuid-1", "uuid-2", ...],
 *     "tone": "Urgent",                     // optional
 *     "estimated_open_rate": "48%"           // optional
 *   }
 *
 * Response (200):
 *   {
 *     "success": true,
 *     "campaign_id": "uuid",
 *     "total_customers": 47,
 *     "status_text": "🚀 Sending to 47 customers",
 *     ...
 *   }
 */
router.post('/send', async (req, res) => {
  const startTime = Date.now();
  console.log("BACKEND: POST /api/campaigns/send hit with payload:", JSON.stringify(req.body, null, 2));

  try {
    // ── 1. Validate input ─────────────────────────────────────
    const validation = validateCampaignInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid campaign data',
        missing_fields: validation.errors,
        hint: 'Check the required fields and try again.',
      });
    }

    const {
      segment_name,
      persona,
      message,
      channel,
      customer_ids,
      tone = null,
      estimated_open_rate = null,
    } = req.body;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🚀 Campaign send request: "${segment_name}"`);
    console.log(`   ${customer_ids.length} customers via ${channel} (${tone || 'default'} tone)`);
    console.log(`${'═'.repeat(60)}`);

    // ── 2. Create campaign in DB (atomic transaction) ─────────
    const campaign = await createCampaign({
      segment_name,
      persona,
      message,
      channel,
      customer_ids,
    });

    // ── 3. Call Channel Service (async, fire-and-forget) ──────
    // We do NOT await the full delivery — just queue it.
    const payload = buildChannelPayload(
      campaign.campaignId,
      message,
      channel,
      campaign.dispatches
    );

    // Fire-and-forget: don't block the response
    callChannelService(payload).catch(err => {
      console.error(`   ❌ Channel service background error: ${err.message}`);
    });

    // ── 4. Return immediately ─────────────────────────────────
    const durationMs = Date.now() - startTime;

    const response = {
      success:             true,
      campaign_id:         campaign.campaignId,
      segment_name,
      persona,
      total_customers:     campaign.totalMessages,
      channel,
      tone:                tone || 'default',
      message_preview:     message.substring(0, 50) + (message.length > 50 ? '...' : ''),
      status_text:         `🚀 Sending to ${campaign.totalMessages} customers`,
      estimated_open_rate: estimated_open_rate || 'N/A',
      created_at:          campaign.createdAt,
      duration_ms:         durationMs,
    };

    console.log(`\n✅ Campaign ${campaign.campaignId} queued in ${durationMs}ms`);
    console.log(`   Channel Service will deliver asynchronously.\n`);

    return res.json(response);

  } catch (err) {
    console.error('\n❌ Campaign send error:', err.message);

    return res.status(500).json({
      success: false,
      error: 'Failed to create campaign',
      detail: err.message,
      hint: 'Check database connection and try again.',
    });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/campaigns/:id/stats — Live campaign performance
// (Placeholder for Phase 1d, returns current stats from DB)
// ──────────────────────────────────────────────────────────────

async function getCampaignAnalyticsData(id) {
  const { mockStatsStore } = require('../services/webhookService');
  const { getMockOrders } = require('../services/attributionService');

  // MOCK MODE
  if (!pool) {
    const stats = mockStatsStore.get(id) || {
      total_sent: 0,
      total_delivered: 0,
      total_opened: 0,
      total_clicked: 0,
      total_failed: 0,
      by_channel: {
        sms: { total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0, total_failed: 0 },
        whatsapp: { total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0, total_failed: 0 },
        email: { total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0, total_failed: 0 },
        rcs: { total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0, total_failed: 0 },
      }
    };

    const sent = stats.total_sent || 0;
    const delivered = stats.total_delivered || 0;
    const opened = stats.total_opened || 0;
    const clicked = stats.total_clicked || 0;

    const deliveryRate = sent > 0 ? ((delivered / sent) * 100).toFixed(1) : '0.0';
    const openRate     = sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0.0';
    const clickRate    = sent > 0 ? ((clicked / sent) * 100).toFixed(1) : '0.0';

    // Mock revenue computation
    const allMockOrders = getMockOrders();
    const campaignOrders = allMockOrders.filter(o => String(o.attributed_campaign_id) === String(id));
    const organicOrders = allMockOrders.filter(o => !o.attributed_campaign_id);

    const attributedOrders = campaignOrders.length;
    const attributedRevenue = campaignOrders.reduce((sum, o) => sum + o.amount, 0);

    const avgOrderValue = attributedOrders > 0 ? parseFloat((attributedRevenue / attributedOrders).toFixed(2)) : 0;
    const revenuePerMessage = sent > 0 ? parseFloat((attributedRevenue / sent).toFixed(2)) : 0;
    const conversionRate = clicked === 0 ? '0/0 = 0%' : `${attributedOrders}/${clicked} = ${((attributedOrders / clicked) * 100).toFixed(1)}%`;

    const organicOrdersCount = organicOrders.length;
    const organicRevenue = organicOrders.reduce((sum, o) => sum + o.amount, 0);

    return {
      success: true,
      campaign_id: id,
      segment_name: 'Mock Campaign',
      channel: 'whatsapp',
      status: 'completed',
      created_at: new Date().toISOString(),
      stats: {
        total_sent: sent,
        total_delivered: delivered,
        total_opened: opened,
        total_clicked: clicked,
        total_failed: stats.total_failed || 0,
        delivery_rate: `${deliveryRate}%`,
        open_rate: `${openRate}%`,
        click_rate: `${clickRate}%`,
        by_channel: stats.by_channel || {
          sms: { total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0, total_failed: 0 },
          whatsapp: { total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0, total_failed: 0 },
          email: { total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0, total_failed: 0 },
          rcs: { total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0, total_failed: 0 },
        }
      },
      funnel: {
        sent,
        delivered,
        opened,
        clicked,
        failed: stats.total_failed || 0,
      },
      revenue: {
        attributed_orders: attributedOrders,
        attributed_revenue: attributedRevenue,
        avg_order_value: avgOrderValue,
        conversion_rate: conversionRate,
        revenue_per_message: revenuePerMessage,
      },
      organic_context: {
        orders_count: organicOrdersCount,
        revenue: organicRevenue,
      }
    };
  }

  // DB MODE
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
        c.id AS campaign_id,
        c.segment_name,
        c.channel,
        c.status,
        c.created_at,
        cs.total_sent,
        cs.total_delivered,
        cs.total_opened,
        cs.total_clicked,
        cs.updated_at AS stats_updated_at
       FROM campaigns c
       LEFT JOIN campaign_stats cs ON cs.campaign_id = c.id
       WHERE c.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const sent = row.total_sent || 0;
    const delivered = row.total_delivered || 0;
    const opened = row.total_opened || 0;
    const clicked = row.total_clicked || 0;

    const deliveryRate = sent > 0 ? ((delivered / sent) * 100).toFixed(1) : '0.0';
    const openRate     = sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0.0';
    const clickRate    = sent > 0 ? ((clicked / sent) * 100).toFixed(1) : '0.0';

    // Attributed orders query
    const attrRes = await client.query(
      `SELECT COUNT(*)::INT AS count, COALESCE(SUM(amount), 0)::NUMERIC(10,2) AS revenue
       FROM orders
       WHERE attributed_campaign_id = $1`,
      [id]
    );
    const attributedOrders = parseInt(attrRes.rows[0].count) || 0;
    const attributedRevenue = parseFloat(attrRes.rows[0].revenue) || 0;

    // Organic orders query
    const organicRes = await client.query(
      `SELECT COUNT(*)::INT AS count, COALESCE(SUM(amount), 0)::NUMERIC(10,2) AS revenue
       FROM orders
       WHERE attributed_campaign_id IS NULL`
    );
    const organicOrdersCount = parseInt(organicRes.rows[0].count) || 0;
    const organicRevenue = parseFloat(organicRes.rows[0].revenue) || 0;

    // Channel breakdown query
    const channelRes = await client.query(
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
      [id]
    );

    const byChannel = {};
    channelRes.rows.forEach(r => {
      byChannel[r.channel] = {
        total_sent: parseInt(r.total_sent) || 0,
        total_delivered: parseInt(r.total_delivered) || 0,
        total_opened: parseInt(r.total_opened) || 0,
        total_clicked: parseInt(r.total_clicked) || 0,
        total_failed: parseInt(r.total_failed) || 0,
      };
    });

    // Calculations with divide-by-zero guards
    const avgOrderValue = attributedOrders > 0 ? parseFloat((attributedRevenue / attributedOrders).toFixed(2)) : 0;
    const revenuePerMessage = sent > 0 ? parseFloat((attributedRevenue / sent).toFixed(2)) : 0;
    const conversionRate = clicked === 0 ? '0/0 = 0%' : `${attributedOrders}/${clicked} = ${((attributedOrders / clicked) * 100).toFixed(1)}%`;

    return {
      success: true,
      campaign_id: row.campaign_id,
      segment_name: row.segment_name,
      channel: row.channel,
      status: row.status,
      created_at: row.created_at,
      stats: {
        total_sent: sent,
        total_delivered: delivered,
        total_opened: opened,
        total_clicked: clicked,
        delivery_rate: `${deliveryRate}%`,
        open_rate: `${openRate}%`,
        click_rate: `${clickRate}%`,
        by_channel: byChannel,
      },
      funnel: {
        sent,
        delivered,
        opened,
        clicked,
        failed: 0,
      },
      revenue: {
        attributed_orders: attributedOrders,
        attributed_revenue: attributedRevenue,
        avg_order_value: avgOrderValue,
        conversion_rate: conversionRate,
        revenue_per_message: revenuePerMessage,
      },
      organic_context: {
        orders_count: organicOrdersCount,
        revenue: organicRevenue,
      }
    };
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────────────────────
// GET /api/campaigns/:id/stats — Live campaign stats + revenue
// ──────────────────────────────────────────────────────────────
router.get('/:id/stats', async (req, res) => {
  try {
    const data = await getCampaignAnalyticsData(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    return res.json(data);
  } catch (err) {
    console.error('❌ Stats fetch error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/campaigns/:id/analytics — Dedicated analytics
// ──────────────────────────────────────────────────────────────
router.get('/:id/analytics', async (req, res) => {
  try {
    const data = await getCampaignAnalyticsData(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    return res.json(data);
  } catch (err) {
    console.error('❌ Analytics fetch error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/campaigns — Retrieve campaign list
// ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    if (pool) {
      // DB Mode
      const query = `
        SELECT
          c.id,
          c.segment_name,
          c.message,
          c.channel,
          c.status,
          c.created_at,
          COALESCE(cs.total_sent, 0)::INT AS messages_sent,
          COALESCE(o.revenue, 0)::NUMERIC(10,2) AS revenue,
          COALESCE(o.orders_count, 0)::INT AS orders
        FROM campaigns c
        LEFT JOIN campaign_stats cs ON cs.campaign_id = c.id
        LEFT JOIN (
          SELECT attributed_campaign_id, COUNT(*) AS orders_count, SUM(amount) AS revenue
          FROM orders
          GROUP BY attributed_campaign_id
        ) o ON o.attributed_campaign_id = c.id
        ORDER BY c.created_at DESC
      `;
      const result = await pool.query(query);
      return res.json(result.rows);
    } else {
      // Mock Mode
      const { getMockOrders } = require('../services/attributionService');
      const { mockStatsStore } = require('../services/webhookService');
      
      const allMockOrders = getMockOrders() || [];
      const mapped = (MOCK_CAMPAIGNS || []).map(c => {
        const stats = mockStatsStore.get(c.id);
        
        let sent = 0;
        if (stats) {
          sent = stats.total_sent;
        } else {
          sent = c.id === 'mock-campaign-1' ? 150 : (c.id === 'mock-campaign-2' ? 200 : 80);
        }

        const campaignOrders = allMockOrders.filter(o => String(o.attributed_campaign_id) === String(c.id));
        const ordersCount = campaignOrders.length;
        const revenue = campaignOrders.reduce((sum, o) => sum + o.amount, 0);

        return {
          id: c.id,
          segment_name: c.segment_name,
          message: c.message,
          channel: c.channel,
          status: c.status,
          created_at: c.created_at,
          messages_sent: sent,
          revenue,
          orders: ordersCount
        };
      });
      // Sort newest first
      mapped.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return res.json(mapped);
    }
  } catch (err) {
    console.error('❌ Campaign list fetch error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/campaigns/:id — Retrieve single campaign details
// ──────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (pool) {
      // DB Mode
      const resQuery = await pool.query(
        'SELECT id, segment_name, message, channel, status, created_at FROM campaigns WHERE id = $1',
        [id]
      );
      if (resQuery.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }
      return res.json(resQuery.rows[0]);
    } else {
      // Mock Mode
      const camp = (MOCK_CAMPAIGNS || []).find(c => String(c.id) === String(id));
      if (!camp) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }
      return res.json(camp);
    }
  } catch (err) {
    console.error('❌ Campaign details fetch error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/campaigns/:id — Delete a campaign
// ──────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (pool) {
      // DB Mode
      const resDelete = await pool.query('DELETE FROM campaigns WHERE id = $1 RETURNING id', [id]);
      if (resDelete.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }
      return res.json({ success: true, message: 'Campaign deleted successfully', id });
    } else {
      // Mock Mode
      const index = (MOCK_CAMPAIGNS || []).findIndex(c => String(c.id) === String(id));
      if (index === -1) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }
      MOCK_CAMPAIGNS.splice(index, 1);
      return res.json({ success: true, message: 'Campaign deleted successfully', id });
    }
  } catch (err) {
    console.error('❌ Campaign deletion error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
