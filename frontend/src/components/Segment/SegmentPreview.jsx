import { Target, Lightbulb, Send } from 'lucide-react';

/**
 * @param {Object} props
 * @param {Object} props.segment - { segment_name, persona, count, reasoning, preview }
 * @param {Function} props.onContinue - Called when marketer clicks "Generate Messages"
 * @param {boolean} props.isGenerating - Loading state for message generation
 */
export default function SegmentPreview({ segment, onContinue, onCancel, isGenerating }) {
  if (!segment) return null;

  const { segment_name, persona, count, reasoning, preview = [] } = segment;

  // Calculations
  const avgSpend = preview.length > 0
    ? Math.round(preview.reduce((sum, c) => sum + c.total_spent, 0) / preview.length)
    : 0;
  const avgRecency = preview.length > 0
    ? Math.round(preview.reduce((sum, c) => sum + (c.recency_days || 0), 0) / preview.length)
    : 0;

  return (
    <div className="segment-preview">
      {/* Header badge */}
      <div className="segment-header">
        <div className="segment-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Target size={14} />
          {persona || segment_name}
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {count} customers
        </span>
      </div>

      {/* Stat cards */}
      <div className="segment-stats">
        <div className="segment-stat">
          <div className="segment-stat-value">{count}</div>
          <div className="segment-stat-label">Customers</div>
        </div>
        <div className="segment-stat">
          <div className="segment-stat-value">₹{avgSpend.toLocaleString('en-IN')}</div>
          <div className="segment-stat-label">Avg Spend</div>
        </div>
        <div className="segment-stat">
          <div className="segment-stat-value">{avgRecency}d</div>
          <div className="segment-stat-label">Avg Recency</div>
        </div>
      </div>

      {/* Customer preview list */}
      {preview.length > 0 && (
        <div className="segment-customers">
          <div className="segment-customers-title">Sample Customers</div>
          {preview.slice(0, 3).map((customer, i) => (
            <div key={customer.id || i} className="customer-row">
              <div className="customer-avatar-sm">
                {(customer.name || 'C')[0].toUpperCase()}
              </div>
              <div className="customer-info">
                <div className="customer-name">{customer.name}</div>
                <div className="customer-meta">
                  {customer.city} · Last purchase {customer.recency_days}d ago · {customer.order_count} orders
                </div>
              </div>
              <div className="customer-spend">
                ₹{(customer.total_spent || 0).toLocaleString('en-IN')}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI reasoning */}
      {reasoning && (
        <div className="reasoning-box" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <Lightbulb size={16} style={{ color: 'var(--blue-500)', flexShrink: 0, marginTop: '2px' }} />
          <span>{reasoning}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="action-area" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-start' }}>
        <button
          className="btn btn-primary"
          onClick={onContinue}
          disabled={isGenerating}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          {isGenerating ? (
            <>
              <div className="spinner" />
              Generating messages...
            </>
          ) : (
            <>
              <Send size={14} />
              Generate Messages
            </>
          )}
        </button>
        <button
          className="btn btn-ghost"
          onClick={onCancel}
          disabled={isGenerating}
          style={{
            color: 'var(--red-500)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          Cancel Campaign
        </button>
      </div>
    </div>
  );
}
