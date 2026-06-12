// ─────────────────────────────────────────────────────────────
// src/services/validationService.js
// Input validation for campaign dispatch
//
// Validates all required fields before anything touches the DB.
// Returns structured errors so the API can return a clear 400.
// ─────────────────────────────────────────────────────────────

const VALID_CHANNELS = ['whatsapp', 'email', 'sms', 'rcs'];
const VALID_TONES    = ['Urgent', 'Personal', 'Value'];
const MAX_MESSAGE_LENGTH = 500;

/**
 * Validates the POST /api/campaigns/send request body.
 *
 * @param {Object} body - req.body
 * @returns {{ valid: boolean, errors?: string[] }}
 */
function validateCampaignInput(body) {
  const errors = [];

  // ── Required strings ────────────────────────────────────────
  if (!body.segment_name || typeof body.segment_name !== 'string') {
    errors.push('segment_name is required (string)');
  }
  if (!body.persona || typeof body.persona !== 'string') {
    errors.push('persona is required (string)');
  }
  if (!body.message || typeof body.message !== 'string') {
    errors.push('message is required (string)');
  }

  // ── Message length ──────────────────────────────────────────
  if (body.message && body.message.length > MAX_MESSAGE_LENGTH) {
    errors.push(`message exceeds max length (${MAX_MESSAGE_LENGTH} chars)`);
  }

  // ── Channel enum ────────────────────────────────────────────
  if (!body.channel || !VALID_CHANNELS.includes(body.channel)) {
    errors.push(`channel must be one of: ${VALID_CHANNELS.join(', ')}`);
  }

  // ── Customer IDs array ──────────────────────────────────────
  if (!body.customer_ids || !Array.isArray(body.customer_ids) || body.customer_ids.length === 0) {
    errors.push('customer_ids is required (non-empty array of UUIDs)');
  }

  // ── Optional: tone validation ───────────────────────────────
  if (body.tone && !VALID_TONES.includes(body.tone)) {
    errors.push(`tone must be one of: ${VALID_TONES.join(', ')}`);
  }

  return errors.length > 0
    ? { valid: false, errors }
    : { valid: true };
}

module.exports = { validateCampaignInput };
