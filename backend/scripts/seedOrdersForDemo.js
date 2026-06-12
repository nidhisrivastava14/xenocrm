// ─────────────────────────────────────────────────────────────
// scripts/seedOrdersForDemo.js
// Demo Seed Script for Campaign Order Attribution
// ─────────────────────────────────────────────────────────────

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Pool } = require('pg');

async function seed() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('⚠️  DATABASE_URL not set. Seed script skipped (mock mode uses in-memory data).');
    return;
  }

  console.log('🔌 Connecting to PostgreSQL to seed order attribution data...');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('supabase') ? { rejectUnauthorized: false } : false,
  });

  try {
    // 1. Fetch some customers
    const custRes = await pool.query('SELECT id FROM customers LIMIT 30');
    const customers = custRes.rows;
    if (customers.length === 0) {
      console.log('❌ No customers found. Please run "npm run seed" (or backend/seed.js) first.');
      process.exit(1);
    }

    console.log(`🛍️  Found ${customers.length} customers. Cleaning up existing attributed orders...`);
    await pool.query('DELETE FROM orders WHERE idempotency_key LIKE \'seed-demo-%\'');

    // 2. Create 3 campaigns for the demo (WhatsApp, SMS, Email)
    console.log('📨 Creating demo campaigns...');
    const now = new Date();

    const c1 = await pool.query(
      `INSERT INTO campaigns (segment_name, message, channel, status, created_at)
       VALUES ('Loyal Champions WhatsApp', 'Hey Champion! Get 25% off our premium line with code CHAMP25', 'whatsapp', 'completed', $1)
       RETURNING id`, [new Date(now - 12 * 3600000)]
    );
    const waCampaignId = c1.rows[0].id;

    const c2 = await pool.query(
      `INSERT INTO campaigns (segment_name, message, channel, status, created_at)
       VALUES ('At Risk SMS', 'Come back! Here is a special 15% discount for you: RISK15', 'sms', 'completed', $1)
       RETURNING id`, [new Date(now - 24 * 3600000)]
    );
    const smsCampaignId = c2.rows[0].id;

    const c3 = await pool.query(
      `INSERT INTO campaigns (segment_name, message, channel, status, created_at)
       VALUES ('Dormant Email', 'We miss you. Explore our new arrivals and save 10% on your next order.', 'email', 'completed', $1)
       RETURNING id`, [new Date(now - 36 * 3600000)]
    );
    const emailCampaignId = c3.rows[0].id;

    // 3. Initialize campaign_stats rows
    await pool.query(`INSERT INTO campaign_stats (campaign_id, total_sent, total_delivered, total_opened, total_clicked) VALUES ($1, 20, 20, 15, 12)`, [waCampaignId]);
    await pool.query(`INSERT INTO campaign_stats (campaign_id, total_sent, total_delivered, total_opened, total_clicked) VALUES ($1, 25, 20, 12, 8)`, [smsCampaignId]);
    await pool.query(`INSERT INTO campaign_stats (campaign_id, total_sent, total_delivered, total_opened, total_clicked) VALUES ($1, 30, 28, 10, 5)`, [emailCampaignId]);

    // Helper to generate a message and an order
    const insertAttributedSale = async (campaignId, customerId, status, hoursAfterMessage, amount, index) => {
      const sentTime = new Date(now - 40 * 3600000); // sent 40h ago
      const orderTime = new Date(sentTime.getTime() + hoursAfterMessage * 3600000);

      // Create message
      const msgRes = await pool.query(
        `INSERT INTO messages (campaign_id, customer_id, phone, status, sent_at, delivered_at, opened_at, clicked_at)
         VALUES ($1, $2, '+91-99999-00000', $3, $4, $4, $4, $4)
         RETURNING id`,
        [campaignId, customerId, status, sentTime]
      );
      const msgId = msgRes.rows[0].id;

      // Create order
      await pool.query(
        `INSERT INTO orders (customer_id, amount, product, order_date, attributed_campaign_id, attributed_message_id, idempotency_key)
         VALUES ($1, $2, 'Attributed Sale', $3, $4, $5, $6)`,
        [customerId, amount, orderTime, campaignId, msgId, `seed-demo-${campaignId}-${index}`]
      );
    };

    // 4. Seed WhatsApp Campaign: 8 attributed orders out of 12 clicks
    console.log('Seeding WhatsApp campaign attributed orders (8 orders)...');
    const waAmounts = [1200, 1500, 800, 2500, 3100, 950, 1800, 2200];
    for (let i = 0; i < 8; i++) {
      const cust = customers[i % customers.length];
      await insertAttributedSale(waCampaignId, cust.id, 'clicked', 2, waAmounts[i], i);
    }

    // 5. Seed SMS Campaign: 3 attributed orders out of 8 clicks
    console.log('Seeding SMS campaign attributed orders (3 orders)...');
    const smsAmounts = [900, 1400, 2100];
    for (let i = 0; i < 3; i++) {
      const cust = customers[(i + 8) % customers.length];
      await insertAttributedSale(smsCampaignId, cust.id, 'clicked', 4, smsAmounts[i], i);
    }

    // 6. Seed Email Campaign: 1 attributed order out of 5 clicks
    console.log('Seeding Email campaign attributed orders (1 order)...');
    const emailCust = customers[15 % customers.length];
    await insertAttributedSale(emailCampaignId, emailCust.id, 'clicked', 8, 3500, 0);

    // 7. Seed 10-15 Organic Orders
    console.log('Seeding organic orders (12 orders)...');
    for (let i = 0; i < 12; i++) {
      const cust = customers[(i + 17) % customers.length];
      const amount = Math.floor(Math.random() * 3000) + 400;
      const orderDate = new Date(now - Math.random() * 48 * 3600000);
      await pool.query(
        `INSERT INTO orders (customer_id, amount, product, order_date, attributed_campaign_id, attributed_message_id, idempotency_key)
         VALUES ($1, $2, 'Organic Fashion Sale', $3, NULL, NULL, $4)`,
        [cust.id, amount, orderDate, `seed-demo-organic-${i}-${now.getTime()}`]
      );
    }

    console.log('✅ Demo attribution seed successfully completed!');
    console.log(`   - WhatsApp Campaign: ${waCampaignId}`);
    console.log(`   - SMS Campaign: ${smsCampaignId}`);
    console.log(`   - Email Campaign: ${emailCampaignId}`);

  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
