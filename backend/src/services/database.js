// ─────────────────────────────────────────────────────────────
// src/services/database.js
// Database service for RFM-based customer querying
//
// Takes RFM parameters from Gemini and builds + executes a
// PostgreSQL query against the customers + orders tables.
// Returns the matching customer count + a preview sample.
//
// If DATABASE_URL is not set, returns mock data so the app
// can still demo without a live database connection.
// ─────────────────────────────────────────────────────────────

const { Pool } = require('pg');

// ── Connection pool (shared across requests) ─────────────────
// Only create the pool if DATABASE_URL is actually set
let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('supabase')
      ? { rejectUnauthorized: false }
      : false,
    max: 10,
    idleTimeoutMillis: 30000,
  });

  pool.on('connect', () => {
    console.log('🔌 New PostgreSQL client connected');
  });

  // Prevent process crash on idle connection drops
  pool.on('error', (err) => {
    console.error('⚠️ PostgreSQL pool error (connection dropped):', err.message);
    console.error('   The pool will automatically reconnect on next query.');
  });
} else {
  console.warn('⚠️ DATABASE_URL not set — database queries will return mock data');
}

// ── Mock data for when DB is unavailable ──────────────────────
const MOCK_CUSTOMERS = [
  { id: 1, name: 'Priya Sharma',  email: 'priya@example.com',  phone: '+91-98765-43210', city: 'Mumbai',    order_count: 8,  total_spent: 24500.00, last_order: new Date('2026-05-15'), recency_days: 27 },
  { id: 2, name: 'Rahul Patel',   email: 'rahul@example.com',  phone: '+91-87654-32109', city: 'Delhi',     order_count: 5,  total_spent: 18200.00, last_order: new Date('2026-04-20'), recency_days: 52 },
  { id: 3, name: 'Ananya Gupta',  email: 'ananya@example.com', phone: '+91-76543-21098', city: 'Bangalore', order_count: 12, total_spent: 35800.00, last_order: new Date('2026-05-28'), recency_days: 14 },
  { id: 4, name: 'Vikram Singh',  email: 'vikram@example.com', phone: '+91-65432-10987', city: 'Pune',      order_count: 3,  total_spent: 9500.00,  last_order: new Date('2026-03-10'), recency_days: 93 },
  { id: 5, name: 'Sneha Reddy',   email: 'sneha@example.com',  phone: '+91-54321-09876', city: 'Hyderabad', order_count: 6,  total_spent: 15700.00, last_order: new Date('2026-05-02'), recency_days: 40 },
];

const MOCK_CAMPAIGNS = [
  {
    id: 'mock-campaign-1',
    segment_name: 'Champions Win-Back',
    message: 'Hey Priya, we miss you! Here is a 20% discount on your next fashion order.',
    channel: 'whatsapp',
    status: 'completed',
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'mock-campaign-2',
    segment_name: 'Lapsed High-Value Shoppers',
    message: 'Hello Rahul, checkout our latest winter wear collection! Flat ₹500 off.',
    channel: 'email',
    status: 'completed',
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'mock-campaign-3',
    segment_name: 'Active Shoppers Deal',
    message: 'Hey, get 10% cashback on checkout today!',
    channel: 'sms',
    status: 'sending',
    created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
  }
];

/**
 * Queries customers matching the given RFM parameters.
 * Returns mock data if DATABASE_URL is not configured.
 */
async function queryCustomersByRFM(rfmParams) {
  // ── If no pool, return mock data ────────────────────────────
  if (!pool) {
    console.log('\n📊 [MOCK MODE] Returning demo customers (DATABASE_URL not set)');

    // Filter mock data by RFM params for realistic demo
    let filtered = MOCK_CUSTOMERS.filter(c => {
      if (rfmParams.recency_min_days != null && c.recency_days < rfmParams.recency_min_days) return false;
      if (rfmParams.recency_max_days != null && c.recency_days > rfmParams.recency_max_days) return false;
      if (rfmParams.frequency_min != null && c.order_count < rfmParams.frequency_min) return false;
      if (rfmParams.frequency_max != null && c.order_count > rfmParams.frequency_max) return false;
      if (rfmParams.monetary_min != null && c.total_spent < rfmParams.monetary_min) return false;
      if (rfmParams.monetary_max != null && c.total_spent > rfmParams.monetary_max) return false;
      return true;
    });

    // If nothing matches the filter, return all mock data
    if (filtered.length === 0) filtered = MOCK_CUSTOMERS;

    console.log(`   ✅ [MOCK] Found ${filtered.length} matching customers`);
    return {
      count: filtered.length,
      preview: filtered.slice(0, 5),
    };
  }

  // ── Live database query ─────────────────────────────────────
  const conditions = [];
  const values = [];
  let paramIndex = 1;

  if (rfmParams.recency_min_days != null) {
    conditions.push(`EXTRACT(DAY FROM (NOW() - MAX(o.created_at))) >= $${paramIndex}`);
    values.push(rfmParams.recency_min_days);
    paramIndex++;
  }
  if (rfmParams.recency_max_days != null) {
    conditions.push(`EXTRACT(DAY FROM (NOW() - MAX(o.created_at))) <= $${paramIndex}`);
    values.push(rfmParams.recency_max_days);
    paramIndex++;
  }
  if (rfmParams.frequency_min != null) {
    conditions.push(`COUNT(o.id) >= $${paramIndex}`);
    values.push(rfmParams.frequency_min);
    paramIndex++;
  }
  if (rfmParams.frequency_max != null) {
    conditions.push(`COUNT(o.id) <= $${paramIndex}`);
    values.push(rfmParams.frequency_max);
    paramIndex++;
  }
  if (rfmParams.monetary_min != null) {
    conditions.push(`COALESCE(SUM(o.amount), 0) >= $${paramIndex}`);
    values.push(rfmParams.monetary_min);
    paramIndex++;
  }
  if (rfmParams.monetary_max != null) {
    conditions.push(`COALESCE(SUM(o.amount), 0) <= $${paramIndex}`);
    values.push(rfmParams.monetary_max);
    paramIndex++;
  }

  const havingClause = conditions.length > 0
    ? `HAVING ${conditions.join(' AND ')}`
    : '';

  const sql = `
    SELECT
      c.id,
      c.name,
      c.email,
      c.phone,
      c.city,
      COUNT(o.id)                                        AS order_count,
      COALESCE(SUM(o.amount), 0)::NUMERIC(10,2)         AS total_spent,
      MAX(o.created_at)                                  AS last_order_date,
      EXTRACT(DAY FROM (NOW() - MAX(o.created_at)))::INT AS recency_days
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id
    GROUP BY c.id, c.name, c.email, c.phone, c.city
    ${havingClause}
    ORDER BY total_spent DESC
  `;

  console.log('\n📊 Executing RFM query...');
  console.log(`   HAVING: ${havingClause || '(none — returning all customers)'}`);
  console.log(`   Params: [${values.join(', ')}]`);

  const result = await pool.query(sql, values);

  const totalCount = result.rows.length;
  const preview = result.rows.slice(0, 5).map(row => ({
    id:            row.id,
    name:          row.name,
    email:         row.email,
    phone:         row.phone,
    city:          row.city,
    order_count:   parseInt(row.order_count),
    total_spent:   parseFloat(row.total_spent),
    last_order:    row.last_order_date,
    recency_days:  row.recency_days,
  }));

  console.log(`   ✅ Found ${totalCount} matching customers`);

  return {
    count: totalCount,
    preview,
  };
}

/**
 * Health check — verifies DB connectivity.
 * Returns mock status if DATABASE_URL is not set.
 */
async function healthCheck() {
  if (!pool) {
    return {
      connected: false,
      mode: 'mock',
      message: 'DATABASE_URL not set — using mock data',
      customerCount: MOCK_CUSTOMERS.length,
    };
  }

  const result = await pool.query('SELECT NOW() AS now, COUNT(*) AS customers FROM customers');
  return {
    connected: true,
    time: result.rows[0].now,
    customerCount: parseInt(result.rows[0].customers),
  };
}

module.exports = { queryCustomersByRFM, healthCheck, pool, MOCK_CUSTOMERS, MOCK_CAMPAIGNS };
