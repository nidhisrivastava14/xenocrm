// ─────────────────────────────────────────────────────────────
// src/services/messageFormatter.js
// Message Formatter — Formats campaign messages per channel
// ─────────────────────────────────────────────────────────────

// Regex to strip emojis and other non-standard characters
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{1F1E6}-\u{1F1FF}]/gu;

/**
 * Formats a raw campaign message based on the chosen channel.
 *
 * @param {string} rawMessage
 * @param {string} channel - sms, whatsapp, email, rcs
 * @param {Object} [customer] - Optional customer details (e.g. name)
 * @returns {Object} { text, metadata }
 */
function formatMessageForChannel(rawMessage, channel, customer = {}) {
  let text = rawMessage || '';

  // Simple customer name substitution if present in template
  if (customer.name) {
    text = text.replace(/Hi\s+Marketer/gi, `Hi ${customer.name}`);
    text = text.replace(/Hi\s+Customer/gi, `Hi ${customer.name}`);
    // Support generic bracket placeholders
    text = text.replace(/\[Name\]/gi, customer.name);
    text = text.replace(/\{name\}/gi, customer.name);
  }

  const metadata = {};

  switch (channel.toLowerCase()) {
    case 'sms':
      // 1. Strip Emojis
      text = text.replace(EMOJI_REGEX, '');

      // 2. Abbreviate common terms to save space
      text = text
        .replace(/discount code/gi, 'Code')
        .replace(/discount/gi, 'OFF')
        .replace(/percent/gi, '%')
        .replace(/favourites/gi, 'favs')
        .replace(/favourite/gi, 'fav')
        .replace(/receive/gi, 'get')
        .replace(/limited time/gi, 'ltd time');

      // 3. Clean up multiple spaces
      text = text.replace(/\s+/g, ' ').trim();
      break;

    case 'whatsapp':
      // WhatsApp allows emojis and formatting.
      // Wrap capitalized alphanumeric coupon codes in asterisks for bolding.
      // Matches codes containing at least 1 letter and 1 number, length 4-12. E.g. COFFEE20, ABC20
      const codeRegex = /\b(?=[A-Z]*[0-9])(?=[0-9]*[A-Z])[A-Z0-9]{4,12}\b/g;
      text = text.replace(codeRegex, (match) => `*${match}*`);
      break;

    case 'email':
      // Full copy, HTML ready, append unsubscribe link
      const unsubscribeLink = 'https://site.com/unsubscribe';
      text = `${text}\n\n---\nTo unsubscribe, click here: ${unsubscribeLink}`;
      metadata.has_unsubscribe = true;
      metadata.unsubscribe_url = unsubscribeLink;
      break;

    case 'rcs':
      // RCS rich media format: add action_url and button_text in metadata
      metadata.button_text = 'Shop Now';
      metadata.action_url = 'https://site.com/promo';
      break;

    default:
      break;
  }

  return {
    text,
    metadata,
  };
}

module.exports = {
  formatMessageForChannel,
};
