// ─────────────────────────────────────────────────────────────
// src/channel-service/simulator.js
// Message delivery simulator — the "Twilio" of our CRM
// ─────────────────────────────────────────────────────────────

const CRM_CALLBACK_URL = process.env.CRM_CALLBACK_URL
  || 'http://localhost:3000/api/webhooks/channel-events';

const MAX_RETRIES    = 3;
const RETRY_BASE_MS  = 500;

// Probability helpers
const randomDelay = (minSec, maxSec) =>
  Math.floor(Math.random() * (maxSec - minSec) * 1000) + minSec * 1000;

const shouldDeliver = () => Math.random() < 0.95;
const shouldOpen = () => Math.random() < 0.40;
const shouldClick = () => Math.random() < 0.20;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sends a delivery event callback to the main CRM webhook.
 */
async function sendCallback(data) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(CRM_CALLBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) return; // success
      console.warn(`   ⚠️  Callback returned ${res.status}, retry ${attempt}/${MAX_RETRIES}`);

    } catch (err) {
      const reason = err.name === 'AbortError' ? 'timeout' : err.message;
      if (attempt < MAX_RETRIES) {
        console.warn(`   ⚠️  Callback failed (${reason}), retry ${attempt}/${MAX_RETRIES}`);
        await sleep(RETRY_BASE_MS * attempt);
      } else {
        console.error(`   ❌ Callback failed after ${MAX_RETRIES} retries (${reason})`);
      }
    }
  }
}

/**
 * Simulates the full delivery lifecycle for ONE message.
 */
async function simulateDelivery(campaignId, message, index) {
  const tag = `  #${String(index + 1).padStart(3)}`;
  const result = { sent: false, delivered: false, opened: false, clicked: false, failed: false };

  const buildCallback = (eventType) => ({
    campaign_id:  campaignId,
    customer_id:  message.customer_id,
    phone:        message.phone,
    event_type:   eventType,
    channel:      message.channel,
    timestamp:    new Date().toISOString(),
    message_id:   message.message_id || null,
  });

  const channel = (message.channel || 'email').toLowerCase();

  if (channel === 'sms') {
    // ── SMS Flow ──
    // Delay: 2-5s to send
    await sleep(randomDelay(2, 5));
    await sendCallback(buildCallback('sent'));
    result.sent = true;
    console.log(`${tag} ✉️  SMS sent      → ${message.phone}`);

    // Delay: 1-3s to deliver or fail
    await sleep(randomDelay(1, 3));
    if (!shouldDeliver()) {
      await sendCallback(buildCallback('failed'));
      result.failed = true;
      console.log(`${tag} ❌ SMS failed    → ${message.phone}`);
      return result;
    }
    await sendCallback(buildCallback('delivered'));
    result.delivered = true;
    console.log(`${tag} 📱 SMS delivered → ${message.phone}`);

  } else if (channel === 'whatsapp') {
    // ── WhatsApp Flow ──
    // Delay: 1-3s to deliver
    await sleep(randomDelay(1, 3));
    await sendCallback(buildCallback('sent'));
    await sendCallback(buildCallback('delivered'));
    result.sent = true;
    result.delivered = true;
    console.log(`${tag} 💬 WA delivered  → ${message.phone}`);

    // Simulate WhatsApp Read Progression (75% read rate)
    if (Math.random() < 0.75) {
      await sleep(10000); // 10s delay
      await sendCallback(buildCallback('read'));
      result.opened = true;
      console.log(`${tag} 💬 WA read       → ${message.phone}`);
    }

  } else if (channel === 'email') {
    // ── Email Flow ──
    // Delay: 10-30s to deliver
    await sleep(randomDelay(10, 30));
    await sendCallback(buildCallback('sent'));
    await sendCallback(buildCallback('delivered'));
    result.sent = true;
    result.delivered = true;
    console.log(`${tag} 📧 Email deliv   → ${message.phone}`);

    // Open/Click Simulation
    if (shouldOpen()) {
      await sleep(randomDelay(5, 15));
      await sendCallback(buildCallback('opened'));
      result.opened = true;
      console.log(`${tag} 👀 Email opened  → ${message.phone}`);

      if (shouldClick()) {
        await sleep(randomDelay(3, 10));
        await sendCallback(buildCallback('clicked'));
        result.clicked = true;
        console.log(`${tag} 🖱️  Email clicked → ${message.phone}`);
      }
    }

  } else if (channel === 'rcs') {
    // ── RCS Flow ──
    // Delay: 1-2s to deliver
    await sleep(randomDelay(1, 2));
    await sendCallback(buildCallback('sent'));
    await sendCallback(buildCallback('delivered'));
    result.sent = true;
    result.delivered = true;
    console.log(`${tag} 📱 RCS delivered → ${message.phone}`);

    // RCS auto-opens
    await sendCallback(buildCallback('opened'));
    result.opened = true;
    console.log(`${tag} 👀 RCS opened    → ${message.phone}`);

    // 30% click rate on action card
    if (Math.random() < 0.30) {
      await sleep(randomDelay(3, 8));
      await sendCallback(buildCallback('clicked'));
      result.clicked = true;
      console.log(`${tag} 🖱️  RCS clicked   → ${message.phone}`);
    }
  }

  return result;
}

/**
 * Processes all messages for a campaign in parallel.
 */
async function simulateBatch(campaignId, messages) {
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`📬 Simulating ${messages.length} messages for campaign: ${campaignId}`);
  console.log(`   Callback URL: ${CRM_CALLBACK_URL}`);
  console.log(`${'─'.repeat(55)}`);

  const startTime = Date.now();

  const promises = messages.map((msg, i) =>
    simulateDelivery(campaignId, msg, i).catch(err => {
      console.error(`  #${i + 1} ❌ Simulation error: ${err.message}`);
      return { sent: false, delivered: false, opened: false, clicked: false, failed: true };
    })
  );

  const results = await Promise.all(promises);

  const summary = results.reduce(
    (acc, r) => ({
      sent:      acc.sent      + (r.sent ? 1 : 0),
      delivered: acc.delivered + (r.delivered ? 1 : 0),
      opened:    acc.opened    + (r.opened ? 1 : 0),
      clicked:   acc.clicked   + (r.clicked ? 1 : 0),
      failed:    acc.failed    + (r.failed ? 1 : 0),
    }),
    { sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0 }
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n${'─'.repeat(55)}`);
  console.log(`✅ Campaign ${campaignId} simulation complete (${elapsed}s)`);
  console.log(`   📨 Sent: ${summary.sent}/${messages.length}`);
  console.log(`   📱 Delivered: ${summary.delivered}`);
  console.log(`   👀 Opened: ${summary.opened}`);
  console.log(`   🖱️  Clicked: ${summary.clicked}`);
  console.log(`   ❌ Failed: ${summary.failed}`);
  console.log(`${'─'.repeat(55)}\n`);

  return summary;
}

module.exports = { simulateBatch };
