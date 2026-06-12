// ─────────────────────────────────────────────────────────────
// src/services/channelRouter.js
// Channel Router — Decides delivery channel & handles fallbacks
// ─────────────────────────────────────────────────────────────

const { pool } = require('./database');

// Mapping from campaign persona name to canonical segment type
const PERSONA_MAPPING = {
  'Champions': 'high_value',
  'Frequent Buyers': 'new',
  'New Customers': 'new',
  'Potential Loyalists': 'new',
  'Lapsed High-Value': 'dormant',
  'At Risk': 'at_risk',
  'high_value': 'high_value',
  'at_risk': 'at_risk',
  'dormant': 'dormant',
  'new': 'new',
};

// Fallback rules in-memory (mock mode / rules missing in DB)
const MOCK_RULES = {
  high_value: { preferred_channel: 'whatsapp', character_limit: 1000, delivery_speed_ms: 500 },
  at_risk: { preferred_channel: 'sms', character_limit: 160, delivery_speed_ms: 100 },
  dormant: { preferred_channel: 'email', character_limit: 5000, delivery_speed_ms: 2000 },
  new: { preferred_channel: 'whatsapp', character_limit: 1000, delivery_speed_ms: 500 },
};

// E.164 phone number validation helper
// Standard format: +[country_code][number] (e.g. +919876543210)
function validateAndSanitizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  // Clean all spaces and hyphens
  const cleanPhone = phone.replace(/[- ]/g, '');
  // Match E.164 format: + followed by 7 to 15 digits
  const e164Regex = /^\+[1-9]\d{6,14}$/;
  if (e164Regex.test(cleanPhone)) {
    return cleanPhone;
  }
  return null;
}

/**
 * Resolves the channel rules for a segment type.
 */
async function getRuleForSegment(segmentType) {
  const canonicalSegment = PERSONA_MAPPING[segmentType] || 'email'; // Safe default segment key

  if (pool) {
    try {
      const result = await pool.query(
        'SELECT preferred_channel, character_limit, delivery_speed_ms FROM channel_rules WHERE segment_type = $1',
        [canonicalSegment]
      );
      if (result.rows.length > 0) {
        return result.rows[0];
      }
    } catch (err) {
      console.error(`⚠️ Database error fetching channel rules for ${segmentType}:`, err.message);
    }
  }

  // Fallback to in-memory rules
  return MOCK_RULES[canonicalSegment] || {
    preferred_channel: 'email',
    character_limit: 5000,
    delivery_speed_ms: 2000,
  };
}

/**
 * Selects the optimal delivery channel and configures speed/priority.
 *
 * @param {string} segmentType - Campaign segment or persona name
 * @param {string} rawPhone - Customer phone number
 * @param {string} email - Customer email address
 * @returns {Object|null} Delivery configuration, or null if skipped
 */
async function selectChannelForSegment(segmentType, rawPhone, email) {
  const rule = await getRuleForSegment(segmentType);
  const preferredChannel = rule.preferred_channel;
  const speed = rule.delivery_speed_ms;

  const phone = validateAndSanitizePhone(rawPhone);
  if (rawPhone && !phone) {
    console.warn(`⚠️ Phone number "${rawPhone}" is not in valid E.164 format. Falling back.`);
  }

  // Determine channels support
  const hasPhone = !!phone;
  const hasEmail = !!email && typeof email === 'string' && email.includes('@');

  // Fallback logic
  let finalChannel = preferredChannel;
  let destination = null;

  if (preferredChannel === 'sms' || preferredChannel === 'whatsapp' || preferredChannel === 'rcs') {
    if (hasPhone) {
      finalChannel = preferredChannel;
      destination = phone;
    } else if (hasEmail) {
      finalChannel = 'email';
      destination = email;
      console.log(`ℹ️ No phone for customer. Falling back from ${preferredChannel} to email.`);
    }
  } else if (preferredChannel === 'email') {
    if (hasEmail) {
      finalChannel = 'email';
      destination = email;
    } else if (hasPhone) {
      finalChannel = 'sms';
      destination = phone;
      console.log(`ℹ️ No email for customer. Falling back from email to sms.`);
    }
  }

  // If both destinations are missing, skip the customer
  if (!destination) {
    console.warn(`❌ Skipping customer: missing both valid phone and email for segment ${segmentType}`);
    return null;
  }

  // Priority config
  const priority = finalChannel === 'email' ? 'normal' : 'high';

  return {
    channel: finalChannel,
    destination,
    speed,
    priority,
    character_limit: finalChannel === 'sms' ? 160 : (finalChannel === 'email' ? 5000 : 1000),
  };
}

module.exports = {
  selectChannelForSegment,
  validateAndSanitizePhone,
  PERSONA_MAPPING,
};
