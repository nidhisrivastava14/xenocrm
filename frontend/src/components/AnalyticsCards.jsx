import React from 'react';

export function ChurnRiskCard({ segments }) {
  if (!segments || segments.length === 0) {
    return <div className="card">No Churn Risk segment data available.</div>;
  }

  return (
    <div className="card" style={{ padding: '24px' }}>
      <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 600 }}>Churn Risk Analysis</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
        {segments.map((seg) => {
          const riskClass = {
            "High Risk": "high-risk",
            "Medium Risk": "medium-risk",
            "Low Risk": "low-risk"
          }[seg.name] || "low-risk";

          return (
            <div key={seg.name} className={`stat-card ${riskClass}`}>
              <div className="stat-label">
                {seg.name}
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, margin: '8px 0', color: 'var(--text-primary)' }}>
                {seg.customer_count} <span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--text-secondary)' }}>customers</span>
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Avg Churn Score: <strong>{seg.avg_churn_score}%</strong>
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Avg CLV: <strong>₹{seg.avg_clv.toLocaleString('en-IN')}</strong>
              </div>

              <div style={{ borderTop: `1px solid var(--border-default)`, paddingTop: '10px' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Sample Customers</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  {seg.customer_sample && seg.customer_sample.map((cust) => (
                    <div key={cust.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ fontWeight: 500 }}>{cust.name}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>₹{cust.clv.toLocaleString('en-IN')} CLV</span>
                    </div>
                  ))}
                  {(!seg.customer_sample || seg.customer_sample.length === 0) && (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>None found</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ConversionFunnel({ funnel, revenue }) {
  if (!funnel) return null;

  const stages = [
    { label: 'Sent', value: funnel.sent, pct: 100, color: 'var(--primary-light)' },
    { label: 'Delivered', value: funnel.delivered, pct: funnel.sent > 0 ? Math.round((funnel.delivered / funnel.sent) * 100) : 0, color: 'var(--success)' },
    { label: 'Opened', value: funnel.opened, pct: funnel.delivered > 0 ? Math.round((funnel.opened / funnel.delivered) * 100) : 0, color: 'var(--info)' },
    { label: 'Clicked', value: funnel.clicked, pct: funnel.opened > 0 ? Math.round((funnel.clicked / funnel.opened) * 100) : 0, color: 'var(--warning)' },
    { label: 'Purchased', value: funnel.purchased, pct: funnel.clicked > 0 ? Math.round((funnel.purchased / funnel.clicked) * 100) : 0, color: 'var(--error)' }
  ];

  const convRate = funnel.sent > 0 ? ((funnel.purchased / funnel.sent) * 100).toFixed(1) : '0';

  return (
    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Campaign Performance & Funnel</h3>
      
      {/* Horizontal funnel steps bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        {stages.map((stage) => (
          <div key={stage.label} style={{
            flex: '1 1 150px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '12px',
            position: 'relative'
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              {stage.label}
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0' }}>
              {stage.value}
            </div>
            <div style={{ fontSize: '12px', color: stage.color, fontWeight: 600 }}>
              {stage.pct}% {stage.label !== 'Sent' && 'of prev'}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: '8px',
        padding: '12px 16px',
        background: 'var(--primary-lighter)',
        color: 'var(--primary)',
        borderRadius: '6px',
        fontWeight: 600,
        fontSize: '14px',
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <span>Conversion Rate: {convRate}%</span>
        <span>ROI: {revenue?.roi || '0%'}</span>
        <span>Revenue: ₹{revenue?.total_attributed_amount?.toLocaleString('en-IN') || 0}</span>
      </div>
    </div>
  );
}
