import React, { useState, useEffect } from 'react';
import { ConversionFunnel } from '../components/AnalyticsCards';
import { Eye, Plus } from 'lucide-react';

export default function CampaignsPage({ onNavigate }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFunnel, setSelectedFunnel] = useState(null);

  useEffect(() => {
    fetch('/api/campaigns')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch campaigns');
        return res.json();
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.campaigns || []);
        setCampaigns(list);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleRowClick = (campaignId) => {
    setSelectedFunnel(null);
    fetch(`/api/analytics/funnel/${campaignId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch funnel stats');
        return res.json();
      })
      .then((data) => {
        setSelectedFunnel(data);
      })
      .catch((err) => {
        console.error(err);
      });
  };

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title">Campaign History</h1>
          <p className="page-subtitle">Track performance and ROI across all campaigns</p>
        </div>

        <button
          className="btn"
          onClick={() => onNavigate('/')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={16} />
          Create Campaign
        </button>
      </div>

      <div className="scrollable" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 200px)', paddingRight: '8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: selectedFunnel ? '1fr 1fr' : '1fr', gap: '24px', alignItems: 'start' }}>
          {/* Campaigns Table Card */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Campaign History</h3>
            </div>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                <div className="spinner" />
              </div>
            ) : error ? (
              <div className="message-error" style={{ padding: '16px', margin: '16px', borderRadius: '8px' }}>
                Error: {error}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '12px 20px', fontWeight: 600 }}>Campaign Name / Segment</th>
                      <th style={{ padding: '12px 20px', fontWeight: 600 }}>Channel</th>
                      <th style={{ padding: '12px 20px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '12px 20px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((camp) => (
                      <tr
                        key={camp.id}
                        onClick={() => handleRowClick(camp.id)}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          background: selectedFunnel?.campaign_id === camp.id ? 'var(--primary-lighter)' : 'inherit',
                        }}
                        className="table-row-hover"
                      >
                        <td style={{ padding: '16px 20px', fontWeight: 500 }}>
                          {camp.segment_name}
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400, marginTop: '2px' }}>
                            Created: {new Date(camp.created_at).toLocaleDateString()}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', textTransform: 'uppercase', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {camp.channel}
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span className={`badge ${camp.status === 'completed' || camp.status === 'sent' ? 'badge-success' : 'badge-warning'}`}>
                            {camp.status}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                          <button
                            className="btn secondary"
                            style={{ padding: '6px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRowClick(camp.id);
                            }}
                          >
                            <Eye size={12} />
                            Analyze
                          </button>
                        </td>
                      </tr>
                    ))}
                    {campaigns.length === 0 && (
                      <tr>
                        <td colSpan="4" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No campaigns found. Create your first one from the Dashboard!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Funnel breakdown panel */}
          {selectedFunnel && (
            <div style={{ position: 'sticky', top: '24px' }}>
              <ConversionFunnel funnel={selectedFunnel.funnel} revenue={selectedFunnel.revenue} />
              <button
                className="btn secondary"
                style={{ marginTop: '12px', width: '100%' }}
                onClick={() => setSelectedFunnel(null)}
              >
                Close Performance Funnel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
