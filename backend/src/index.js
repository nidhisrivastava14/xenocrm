// ─────────────────────────────────────────────────────────────
// src/index.js
// Express + Socket.io server for Xeno Mini CRM Backend
//
// Service 1: Main CRM Backend
// ├── POST /api/chat               → AI-native intent → RFM → customers
// ├── POST /api/draft-messages     → AI message generation (3 variants)
// ├── POST /api/campaigns/send     → Dispatch campaign to Channel Service
// ├── GET  /api/campaigns/:id/stats → Live campaign performance
// ├── POST /api/webhooks/channel-events → Delivery callbacks (idempotent)
// ├── GET  /api/health             → Health check
// └── WebSocket (Socket.io)        → Real-time stats broadcast
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { healthCheck, pool, MOCK_CAMPAIGNS } = require('./services/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Create HTTP server + attach Socket.io ─────────────────────
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',              // Allow React frontend from any origin
    methods: ['GET', 'POST'],
  },
});

// Store io instance on app so routes can access it via req.app.get('io')
app.set('io', io);

// ── Socket.io connection handling ─────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 WebSocket client connected: ${socket.id}`);

  // Client can join a campaign-specific room for targeted updates
  socket.on('join_campaign', (campaignId) => {
    socket.join(`campaign:${campaignId}`);
    console.log(`   └─ ${socket.id} joined room: campaign:${campaignId}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 WebSocket client disconnected: ${socket.id}`);
  });
});

// ── Middleware ─────────────────────────────────────────────────
app.use(cors());                      // Allow frontend (React) to call API
app.use(express.json());              // Parse JSON request bodies

// ── Request logging ───────────────────────────────────────────
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const dbStatus = await healthCheck();
    res.json({
      status: 'ok',
      service: 'xeno-mini-crm-backend',
      database: dbStatus,
      gemini: process.env.GEMINI_API_KEY ? 'configured' : 'NOT CONFIGURED ❌',
      websocket: {
        connected_clients: io.engine.clientsCount,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      error: err.message,
    });
  }
});

// Dashboard metrics endpoint
app.get('/api/dashboard', async (req, res) => {
  try {
    if (pool) {
      // DB Mode
      const query = `
        SELECT
          (SELECT COUNT(*)::INT FROM campaigns) AS total_campaigns,
          (SELECT COALESCE(SUM(total_sent), 0)::INT FROM campaign_stats) AS total_messages,
          (SELECT COALESCE(SUM(amount), 0)::NUMERIC(10,2) FROM orders WHERE attributed_campaign_id IS NOT NULL) AS total_revenue,
          (SELECT COUNT(*)::INT FROM orders WHERE attributed_campaign_id IS NOT NULL) AS total_orders
      `;
      const result = await pool.query(query);
      const row = result.rows[0];
      return res.json({
        totalCampaigns: row.total_campaigns,
        totalMessages: row.total_messages,
        totalRevenue: parseFloat(row.total_revenue) || 0,
        totalOrders: row.total_orders,
      });
    } else {
      // Mock Mode
      const { getMockOrders } = require('./services/attributionService');
      const { mockStatsStore } = require('./services/webhookService');
      
      const totalCampaigns = MOCK_CAMPAIGNS ? MOCK_CAMPAIGNS.length : 0;
      
      let totalMessages = 0;
      if (MOCK_CAMPAIGNS) {
        for (const c of MOCK_CAMPAIGNS) {
          const stats = mockStatsStore.get(c.id);
          if (stats) {
            totalMessages += stats.total_sent || 0;
          } else {
            // fallback default sent numbers for default seeded ones if stats map doesn't have them yet
            totalMessages += c.id === 'mock-campaign-1' ? 150 : (c.id === 'mock-campaign-2' ? 200 : 80);
          }
        }
      }
      
      const allMockOrders = getMockOrders() || [];
      const attributedOrders = allMockOrders.filter(o => o.attributed_campaign_id !== null);
      const totalRevenue = attributedOrders.reduce((sum, o) => sum + o.amount, 0);
      const totalOrders = attributedOrders.length;
      
      return res.json({
        totalCampaigns,
        totalMessages,
        totalRevenue,
        totalOrders,
      });
    }
  } catch (err) {
    console.error('❌ Dashboard stats fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Chat endpoint (Phase 1b)
const chatRoutes = require('./routes/chat');
app.use('/api/chat', chatRoutes);

// Message generation endpoint (Phase 2)
const messageRoutes = require('./routes/messages');
app.use('/api/draft-messages', messageRoutes);

// Campaign dispatch + stats endpoints (Phase 1c)
const campaignRoutes = require('./routes/campaigns');
app.use('/api/campaigns', campaignRoutes);

// Webhook endpoint for Channel Service callbacks (Phase 1e)
// Replaces the old inline handler with proper service layer:
//   - Idempotent (duplicate callbacks don't double-count)
//   - Transactional (message update + stats recalculation are atomic)
//   - COUNT-based stats (accurate, not increment-based)
//   - WebSocket broadcast (live dashboard updates)
const webhookRoutes = require('./routes/webhooks');
app.use('/api/webhooks', webhookRoutes);

// Orders endpoint (Phase 3 Order Attribution)
const orderRoutes = require('./routes/orders');
app.use('/api/orders', orderRoutes);

// Advanced Analytics endpoint
const analyticsRoutes = require('./routes/analytics');
app.get('/api/analytics/funnel/:campaignId', analyticsRoutes.getCampaignFunnel);
app.get('/api/analytics/segments/churn', analyticsRoutes.getChurnSegments);

// Specific catch-all error handler for orders to satisfy strict generic JSON error rules
app.use('/api/orders', (err, req, res, next) => {
  console.error('💥 Orders API error:', err);
  res.status(500).json({
    success: false,
    error: 'Something went wrong, please try again',
  });
});

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `No route for ${req.method} ${req.url}`,
    available: [
      'GET  /api/health',
      'POST /api/chat               → { "message": "your intent here" }',
      'POST /api/draft-messages     → { "persona": "...", "count": N, ... }',
      'POST /api/campaigns/send     → { "segment_name", "message", "channel", "customer_ids" }',
      'GET  /api/campaigns/:id/stats → Campaign performance dashboard',
      'POST /api/webhooks/channel-events → { "campaign_id", "customer_id", "event_type" }',
    ],
  });
});

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// ── Start server ──────────────────────────────────────────────
// Use server.listen (not app.listen) so Socket.io shares the same port
server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║         Xeno Mini CRM — Backend Server              ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  🌐 Server:    http://localhost:${PORT}                   ║`);
  console.log(`║  🏥 Health:    http://localhost:${PORT}/api/health         ║`);
  console.log(`║  💬 Chat:      POST /api/chat                       ║`);
  console.log(`║  ✉️  Draft:     POST /api/draft-messages              ║`);
  console.log(`║  🚀 Send:      POST /api/campaigns/send              ║`);
  console.log(`║  📊 Stats:     GET  /api/campaigns/:id/stats         ║`);
  console.log(`║  📩 Webhooks:  POST /api/webhooks/channel-events     ║`);
  console.log(`║  🔌 WebSocket: ws://localhost:${PORT} (Socket.io)         ║`);
  console.log('║                                                      ║');
  console.log(`║  📦 DB:        ${process.env.DATABASE_URL ? '✅ Connected' : '❌ Not configured'}                        ║`);
  console.log(`║  🤖 Gemini:    ${process.env.GEMINI_API_KEY ? '✅ API key set' : '❌ Not configured'}                       ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
