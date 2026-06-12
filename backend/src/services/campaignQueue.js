// ─────────────────────────────────────────────────────────────
// src/services/campaignQueue.js
// Campaign Queue — Handles message chunking, formatting, and DB inserts
// ─────────────────────────────────────────────────────────────

const { pool } = require('./database');
const { selectChannelForSegment } = require('./channelRouter');
const { formatMessageForChannel } = require('./messageFormatter');

/**
 * Splits a text string into chunks of 160 characters for SMS.
 * If text exceeds 160, it splits at character 157 and appends '...'
 *
 * @param {string} text
 * @returns {string[]} Array of split text parts
 */
function splitSMS(text) {
  const limit = 160;
  if (!text || text.length <= limit) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > limit) {
    chunks.push(remaining.substring(0, 157) + '...');
    remaining = remaining.substring(157);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Resolves channels, formats messages, splits SMS, and batch-inserts records into the DB.
 *
 * @param {Object} client - Active pg client (transaction)
 * @param {string} campaignId
 * @param {Object[]} customers - Array of customer details: { id, name, phone, email }
 * @param {string} rawMessage - The base template message
 * @param {string} segmentType - Campaign segment/persona name
 * @returns {Promise<Object[]>} List of prepared message dispatches for the simulator
 */
async function queueCampaignMessages(client, campaignId, customers, rawMessage, segmentType) {
  const messageRecords = [];
  const dispatches = [];

  for (const customer of customers) {
    // 1. Resolve channel for this customer
    const route = await selectChannelForSegment(segmentType, customer.phone, customer.email);
    if (!route) {
      // Skipped due to missing/invalid contact channels (logged inside router)
      continue;
    }

    // 2. Format message for this channel
    const formatted = formatMessageForChannel(rawMessage, route.channel, customer);

    // 3. Handle SMS splitting if channel is SMS
    if (route.channel === 'sms' && formatted.text.length > 160) {
      const parts = splitSMS(formatted.text);
      parts.forEach((partText, idx) => {
        const partNum = idx + 1;
        const totalParts = parts.length;
        
        // Create individual message records for DB insertion
        messageRecords.push({
          campaignId,
          customerId: customer.id,
          phone: customer.phone, // required DB field
          phoneNumber: route.destination,
          channel: 'sms',
          characterCount: partText.length,
          status: 'pending',
          messageText: partText,
          channelSpecificData: {
            sms_part: partNum,
            sms_total: totalParts,
            is_split: true,
            original_length: formatted.text.length,
          },
          email: customer.email,
        });
      });
    } else {
      // WhatsApp, Email, RCS, or unsplit SMS
      const channelSpecificData = { ...formatted.metadata };

      messageRecords.push({
        campaignId,
        customerId: customer.id,
        phone: customer.phone || '+91-00000-00000', // DB field constraint fallback
        phoneNumber: route.channel !== 'email' ? route.destination : null,
        channel: route.channel,
        characterCount: formatted.text.length,
        status: 'pending',
        messageText: formatted.text,
        channelSpecificData,
        email: customer.email,
      });
    }
  }

  // 4. Batch insert message records to the database (if in database mode)
  if (pool && client) {
    for (const record of messageRecords) {
      const insertResult = await client.query(
        `INSERT INTO messages (
          campaign_id, customer_id, phone, phone_number,
          channel, character_count, status, channel_specific_data
        )
        VALUES ($1, $2, $3, $4, $5::message_channel, $6, $7::message_status, $8)
        RETURNING id`,
        [
          record.campaignId,
          record.customerId,
          record.phone,
          record.phoneNumber,
          record.channel,
          record.characterCount,
          record.status,
          JSON.stringify(record.channelSpecificData),
        ]
      );
      
      const messageId = insertResult.rows[0].id;
      dispatches.push({
        message_id: messageId,
        customer_id: record.customerId,
        phone: record.phoneNumber || record.phone, // fallback to standard phone if email
        email: record.channel === 'email' ? record.email : null,
        message: record.messageText,
        channel: record.channel,
        channelSpecificData: {
          ...record.channelSpecificData,
          message_id: messageId,
        },
      });
    }
  } else {
    // Mock Mode
    messageRecords.forEach((record, index) => {
      const mockId = 'msg-' + Math.random().toString(36).substring(2, 15);
      dispatches.push({
        message_id: mockId,
        customer_id: record.customerId,
        phone: record.phoneNumber || record.phone,
        email: record.channel === 'email' ? record.email : null,
        message: record.messageText,
        channel: record.channel,
        channelSpecificData: {
          ...record.channelSpecificData,
          message_id: mockId,
        },
      });
    });
  }

  return dispatches;
}

module.exports = {
  splitSMS,
  queueCampaignMessages,
};
