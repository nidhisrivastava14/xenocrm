// ─────────────────────────────────────────────────────────────
// src/routes/chat.js
// POST /api/chat — The core AI-native CRM endpoint
//
// Flow:
//   1. Marketer sends natural-language message
//   2. Gemini extracts RFM parameters + persona
//   3. Database query finds matching customers
//   4. Response includes segment info + customer preview
//
// This is what makes the CRM "AI-native" — the marketer
// never touches filters or forms. They just describe intent.
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { extractRFM } = require('../services/gemini');
const { queryCustomersByRFM } = require('../services/database');

/**
 * POST /api/chat
 *
 * Request body:
 *   { "message": "I want to win back customers who used to buy regularly but stopped" }
 *
 * Response:
 *   {
 *     "success": true,
 *     "segment_name": "Lapsed High-Value",
 *     "persona": "Lapsed High-Value",
 *     "rfm_params": { recency_min_days, recency_max_days, ... },
 *     "count": 42,
 *     "preview": [ { name, email, city, order_count, total_spent, ... } ],
 *     "reasoning": "These customers used to buy frequently...",
 *     "ai_model": "gemini-2.5-flash"
 *   }
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();

  try {
    // ── 1. Validate input ─────────────────────────────────────
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing or empty "message" field',
        hint: 'Send a JSON body like: { "message": "I want loyal customers who stopped buying" }',
      });
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`💬 Chat request: "${message}"`);
    console.log(`${'═'.repeat(60)}`);

    // ── 2. Call Gemini to extract RFM parameters ──────────────
    const rfmParams = await extractRFM(message.trim());

    // ── 3. Query database with extracted parameters ───────────
    const { count, preview } = await queryCustomersByRFM(rfmParams);

    // ── 4. Build and return response ──────────────────────────
    const durationMs = Date.now() - startTime;

    const response = {
      success:      true,
      segment_name: rfmParams.persona,
      persona:      rfmParams.persona,
      rfm_params: {
        recency_min_days: rfmParams.recency_min_days ?? null,
        recency_max_days: rfmParams.recency_max_days ?? null,
        frequency_min:    rfmParams.frequency_min ?? null,
        frequency_max:    rfmParams.frequency_max ?? null,
        monetary_min:     rfmParams.monetary_min ?? null,
        monetary_max:     rfmParams.monetary_max ?? null,
      },
      count,
      preview,
      reasoning:    rfmParams.reasoning,
      ai_model:     'gemini-2.0-flash',
      duration_ms:  durationMs,
    };

    console.log(`\n🎯 Result: ${count} customers in "${rfmParams.persona}" (${durationMs}ms)`);

    return res.json(response);

  } catch (err) {
    console.error('\n❌ Chat endpoint error:', err.message);
    console.error("Chat API Error:", err.message, err.response?.data || err);

    // Determine appropriate status code
    const status = err.message.includes('GEMINI_API_KEY')
      ? 500
      : err.message.includes('Gemini')
        ? 502  // Bad Gateway — upstream LLM issue
        : 500; // Internal Server Error

    return res.status(status).json({
      success: false,
      error: err.message,
      hint: status === 502
        ? 'The AI service returned an unexpected response. Try rephrasing your message.'
        : 'Something went wrong on the server. Check the logs.',
    });
  }
});

module.exports = router;
