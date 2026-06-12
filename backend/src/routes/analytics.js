const { pool, MOCK_CUSTOMERS } = require('../services/database');
const { getMockOrders } = require('../services/attributionService');

// GET /api/analytics/funnel/:campaignId
async function getCampaignFunnel(req, res) {
  const { campaignId } = req.params;
  
  try {
    if (!pool) {
      // Mock mode
      const { mockStatsStore } = require('../services/webhookService');
      const stats = mockStatsStore.get(campaignId) || {
        total_sent: 100,
        total_delivered: 95,
        total_opened: 45,
        total_clicked: 12,
        total_failed: 0,
      };

      const sent = stats.total_sent || 100;
      const delivered = stats.total_delivered || 95;
      const opened = stats.total_opened || 45;
      const clicked = stats.total_clicked || 12;

      // Attribute mock orders
      const allOrders = getMockOrders();
      const campaignOrders = allOrders.filter(o => String(o.attributed_campaign_id) === String(campaignId));
      const purchased = campaignOrders.length || 2;
      const total_attributed = campaignOrders.reduce((sum, o) => sum + o.amount, 0) || (purchased * 1500);

      const response = {
        campaign_id: campaignId,
        funnel: {
          sent,
          delivered,
          opened,
          clicked,
          purchased
        },
        rates: {
          delivery_rate: ((delivered / sent) * 100).toFixed(1) + '%',
          open_rate: ((opened / delivered) * 100).toFixed(1) + '%',
          click_rate: ((clicked / opened) * 100).toFixed(1) + '%',
          conversion_rate: ((purchased / sent) * 100).toFixed(1) + '%'
        },
        revenue: {
          total_attributed: parseFloat(total_attributed),
          cost_per_send: 0.50,
          roi: ((parseFloat(total_attributed) - (sent * 0.50)) / (sent * 0.50) * 100).toFixed(0) + '%'
        }
      };
      return res.json(response);
    }

    // QUERY 1: Get message funnel stats
    const funnelQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'failed')) as sent,
        COUNT(*) FILTER (WHERE status IN ('delivered', 'opened', 'clicked', 'failed')) as delivered,
        COUNT(*) FILTER (WHERE status IN ('opened', 'clicked')) as opened,
        COUNT(*) FILTER (WHERE status = 'clicked') as clicked
      FROM messages
      WHERE campaign_id = $1
    `;
    
    const funnelResult = await pool.query(funnelQuery, [campaignId]);
    const funnel = funnelResult.rows[0] || { sent: 0, delivered: 0, opened: 0, clicked: 0 };
    
    // QUERY 2: Get attributed orders (conversion)
    const ordersQuery = `
      SELECT COUNT(*) as purchased, COALESCE(SUM(amount), 0) as total_attributed
      FROM orders
      WHERE attributed_campaign_id = $1
        AND order_date >= NOW() - INTERVAL '48 hours'
    `;
    
    const ordersResult = await pool.query(ordersQuery, [campaignId]);
    const { purchased, total_attributed } = ordersResult.rows[0];
    funnel.purchased = parseInt(purchased);
    
    // CALCULATE RATES
    const sent = parseInt(funnel.sent) || 1; // avoid divide by 0
    const delivered = parseInt(funnel.delivered) || 0;
    const opened = parseInt(funnel.opened) || 0;
    const clicked = parseInt(funnel.clicked) || 0;
    
    const response = {
      campaign_id: campaignId,
      funnel: {
        sent,
        delivered,
        opened,
        clicked,
        purchased: parseInt(purchased)
      },
      rates: {
        delivery_rate: ((delivered / sent) * 100).toFixed(1) + '%',
        open_rate: ((opened / delivered) * 100).toFixed(1) + '%',
        click_rate: ((clicked / opened) * 100).toFixed(1) + '%',
        conversion_rate: ((parseInt(purchased) / sent) * 100).toFixed(1) + '%'
      },
      revenue: {
        total_attributed: parseFloat(total_attributed),
        cost_per_send: 0.50,
        roi: ((parseFloat(total_attributed) - (sent * 0.50)) / (sent * 0.50) * 100).toFixed(0) + '%'
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Funnel query error:', error);
    res.status(500).json({ error: 'Failed to fetch funnel' });
  }
}

// GET /api/analytics/segments/churn
async function getChurnSegments(req, res) {
  try {
    if (!pool) {
      // Mock mode
      const mockOrders = getMockOrders();
      const customersList = MOCK_CUSTOMERS.map(c => {
        const customerOrders = mockOrders.filter(o => String(o.customer_id) === String(c.id));
        return {
          id: c.id,
          name: c.name,
          email: c.email,
          orders: customerOrders.map(o => ({ created_at: o.order_date, amount: o.amount }))
        };
      });

      const segmentsMap = {
        high: { name: "High Risk", customer_count: 0, total_clv: 0, total_churn_score: 0, customer_sample: [] },
        medium: { name: "Medium Risk", customer_count: 0, total_clv: 0, total_churn_score: 0, customer_sample: [] },
        low: { name: "Low Risk", customer_count: 0, total_clv: 0, total_churn_score: 0, customer_sample: [] }
      };

      const { calculateChurnRisk, predictCLV } = require('../services/advancedSegmentation');

      customersList.forEach(c => {
        const churn = calculateChurnRisk(c.id, c.orders);
        const clv = predictCLV(c.id, c.orders);
        const group = segmentsMap[churn.risk_level] || segmentsMap.low;

        group.customer_count++;
        group.total_clv += clv.predicted_lifetime_value;
        group.total_churn_score += churn.churn_score;
        if (group.customer_sample.length < 5) {
          group.customer_sample.push({
            name: c.name,
            email: c.email,
            clv: clv.predicted_lifetime_value
          });
        }
      });

      const segments = Object.entries(segmentsMap).map(([key, g]) => ({
        risk_level: key,
        name: g.name,
        customer_count: g.customer_count,
        avg_clv: g.customer_count > 0 ? Math.round(g.total_clv / g.customer_count) : 0,
        avg_churn_score: g.customer_count > 0 ? Math.round(g.total_churn_score / g.customer_count) : 0,
        customer_sample: g.customer_sample
      }));

      return res.json(segments);
    }

    // QUERY: Group customers by churn risk
    const query = `
      WITH customer_stats AS (
        SELECT 
          c.id,
          c.name,
          c.email,
          COUNT(o.id) as total_purchases,
          COALESCE(AVG(o.amount), 0) as avg_order_value,
          COALESCE(MAX(o.created_at), NOW()) as last_purchase_date,
          EXTRACT(DAY FROM NOW() - COALESCE(MAX(o.created_at), NOW())) as days_since_purchase,
          COALESCE(
            EXTRACT(DAY FROM COALESCE(MAX(o.created_at), NOW()) - COALESCE(MIN(o.created_at), NOW())) 
            / NULLIF(COUNT(o.id) - 1, 0), 
            30
          ) as avg_interval_days
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id
        GROUP BY c.id, c.name, c.email
      ),
      churn_scored AS (
        SELECT 
          *,
          CASE 
            WHEN days_since_purchase > (avg_interval_days * 1.5) THEN 'high'
            WHEN days_since_purchase > avg_interval_days THEN 'medium'
            ELSE 'low'
          END as risk_level,
          ROUND((days_since_purchase / NULLIF(avg_interval_days, 0))::numeric * 100) as churn_score
        FROM customer_stats
      )
      SELECT 
        risk_level,
        COUNT(*) as customer_count,
        ROUND(AVG(avg_order_value * 12)::numeric) as avg_clv,
        ROUND(AVG(churn_score)::numeric) as avg_churn_score,
        JSON_AGG(JSON_BUILD_OBJECT('name', name, 'email', email, 'clv', avg_order_value * 12) ORDER BY churn_score ) as sample_customers
      FROM churn_scored
      GROUP BY risk_level
      ORDER BY 
        CASE WHEN risk_level = 'high' THEN 1 WHEN risk_level = 'medium' THEN 2 ELSE 3 END
    `;
    
    const result = await pool.query(query);
    
    const riskNames = {
      high: "High Risk",
      medium: "Medium Risk",
      low: "Low Risk"
    };

    const segments = result.rows.map(row => ({
      risk_level: row.risk_level,
      name: riskNames[row.risk_level] || row.risk_level,
      customer_count: parseInt(row.customer_count),
      avg_clv: parseFloat(row.avg_clv) || 0,
      avg_churn_score: parseFloat(row.avg_churn_score) || 0,
      sample_customers: row.sample_customers || []
    }));
    
    res.json(segments);
  } catch (error) {
    console.error('Churn segments error:', error);
    res.status(500).json({ error: 'Failed to fetch segments' });
  }
}

module.exports = {
  getCampaignFunnel,
  getChurnSegments
};
