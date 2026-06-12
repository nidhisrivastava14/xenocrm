import React, { useState, useEffect } from 'react';
import { ChurnRiskCard } from '../components/AnalyticsCards';
import { ArrowRight, Sparkles } from 'lucide-react';

export default function AnalyticsPage({ onNavigate }) {
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('http://localhost:5000/api/analytics/segments/churn')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        console.log('Churn data:', data);
        setSegments(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Churn fetch error:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title">
            Advanced Analytics
          </h1>
          <p className="page-subtitle">
            Predictive segmentations, Customer Lifetime Value (CLV), and risk forecasting.
          </p>
        </div>

        <button
          className="btn-funnel"
          onClick={() => onNavigate('/campaigns')}
        >
          View Funnel Details
          <ArrowRight size={16} />
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div className="spinner" />
        </div>
      ) : error ? (
        <div className="message-error" style={{ padding: '16px', borderRadius: '8px' }}>
          Error: {error}
        </div>
      ) : (
        <>
          <div className="ai-tip">
            <Sparkles className="ai-tip-icon" />
            <span className="ai-tip-text">
              <strong>AI Tip</strong>: High Risk churn segments are calculated comparing purchase frequency to gap time. Target these customers with SMS or WhatsApp urgent promos.
            </span>
          </div>

          <ChurnRiskCard segments={segments} />
        </>
      )}
    </div>
  );
}
