/**
 * calculateChurnRisk
 * Input: customerId, array of orders ({created_at or date, amount})
 * Logic: Churn = days since last purchase / average purchase interval.
 */
function calculateChurnRisk(customerId, orders) {
  if (!orders || orders.length === 0) {
    return {
      churn_score: 100,
      risk_level: "high",
      days_since_purchase: 365,
      avg_interval_days: 30
    };
  }

  const sortedOrders = [...orders].sort((a, b) => new Date(a.created_at || a.date) - new Date(b.created_at || b.date));
  const lastPurchaseDate = new Date(sortedOrders[sortedOrders.length - 1].created_at || sortedOrders[sortedOrders.length - 1].date);
  const now = new Date();
  const days_since_purchase = Math.max(0, Math.floor((now - lastPurchaseDate) / (1000 * 60 * 60 * 24)));

  let avg_interval_days = 30; // Default fallback
  if (sortedOrders.length > 1) {
    let totalIntervals = 0;
    for (let i = 1; i < sortedOrders.length; i++) {
      const d1 = new Date(sortedOrders[i - 1].created_at || sortedOrders[i - 1].date);
      const d2 = new Date(sortedOrders[i].created_at || sortedOrders[i].date);
      totalIntervals += Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
    }
    avg_interval_days = Math.max(1, Math.floor(totalIntervals / (sortedOrders.length - 1)));
  }

  const ratio = days_since_purchase / avg_interval_days;
  let churn_score = Math.min(100, Math.round(ratio * 50));
  let risk_level = "low";
  
  if (ratio > 1.5) {
    risk_level = "high";
  } else if (ratio > 0.8) {
    risk_level = "medium";
  }

  return {
    churn_score,
    risk_level,
    days_since_purchase,
    avg_interval_days
  };
}

/**
 * predictCLV
 * Input: customerId, array of orders
 * Logic: CLV = avg_order_value × frequency_per_month × 24
 */
function predictCLV(customerId, orders) {
  if (!orders || orders.length === 0) {
    return {
      predicted_lifetime_value: 0,
      avg_order_value: 0,
      purchase_frequency_per_month: 0
    };
  }

  const totalSpent = orders.reduce((sum, o) => sum + parseFloat(o.amount), 0);
  const avg_order_value = Math.round(totalSpent / orders.length);

  const sortedOrders = [...orders].sort((a, b) => new Date(a.created_at || a.date) - new Date(b.created_at || b.date));
  const firstDate = new Date(sortedOrders[0].created_at || sortedOrders[0].date);
  const lastDate = new Date();
  
  const diffMonths = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 30.4));
  const purchase_frequency_per_month = parseFloat((orders.length / diffMonths).toFixed(2));
  
  const predicted_lifetime_value = Math.round(avg_order_value * purchase_frequency_per_month * 24);

  return {
    predicted_lifetime_value,
    avg_order_value,
    purchase_frequency_per_month
  };
}

module.exports = {
  calculateChurnRisk,
  predictCLV
};
