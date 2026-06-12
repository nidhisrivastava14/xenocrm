// ─────────────────────────────────────────────────────────────
// src/components/Dashboard/EngagementTimeline.jsx
// Visual funnel — animated bars showing the delivery cascade
// ─────────────────────────────────────────────────────────────

import { calcRate } from '../../utils/calculations';
import { BarChart2, AlertCircle, CheckCircle2 } from 'lucide-react';

const STAGES = [
  { key: 'total_sent',       label: 'Sent',       color: 'var(--blue-500)' },
  { key: 'total_delivered',  label: 'Delivered',  color: 'var(--green-500)' },
  { key: 'total_opened',     label: 'Opened',     color: 'var(--purple-500)' },
  { key: 'total_clicked',    label: 'Clicked',    color: 'var(--orange-500)' },
];

/**
 * @param {Object} props
 * @param {Object} props.stats - { total_sent, total_delivered, total_opened, total_clicked }
 * @param {number} props.totalCustomers - Total customers in campaign
 */
export default function EngagementTimeline({ stats, totalCustomers }) {
  // Base denominator is totalCustomers (the 100% baseline)
  const maxVal = Math.max(totalCustomers, stats.total_sent || 0, 1);

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: 16,
      marginBottom: 12,
    }}>
      <div style={{
        fontSize: 'var(--font-sm)',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}>
        <BarChart2 size={16} style={{ color: 'var(--blue-500)' }} />
        Engagement Funnel
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STAGES.map(({ key, label, color }) => {
          const value = stats[key] || 0;
          const pct = calcRate(value, maxVal);
          const barWidth = maxVal > 0 ? (value / maxVal) * 100 : 0;

          return (
            <div key={key} style={{
              paddingBottom: 8,
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              {/* Label row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}>
                <span style={{
                  fontSize: 'var(--font-xs)',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: color,
                    display: 'inline-block'
                  }} />
                  {label}
                </span>
                <span style={{
                  fontSize: 'var(--font-xs)',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}>
                  {value} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({pct}%)</span>
                </span>
              </div>

              {/* Bar */}
              <div style={{
                width: '100%',
                height: 8,
                background: 'var(--bg-primary)',
                borderRadius: '4px',
                overflow: 'hidden',
                border: '1px solid var(--border-subtle)',
              }}>
                <div style={{
                  height: '100%',
                  width: `${barWidth}%`,
                  background: color,
                  borderRadius: '4px',
                  transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Drop-off labels */}
      {stats.total_sent > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 12,
          fontSize: '0.65rem',
          color: 'var(--text-muted)',
          alignItems: 'center',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {stats.total_failed > 0 ? (
              <>
                <AlertCircle size={10} style={{ color: 'var(--red-500)' }} />
                <span style={{ color: 'var(--red-500)' }}>{stats.total_failed} failed</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={10} style={{ color: 'var(--green-500)' }} />
                <span>No failures</span>
              </>
            )}
          </span>
          <span>
            {stats.total_delivered > 0
              ? `${calcRate(stats.total_opened, stats.total_delivered)}% of delivered opened`
              : 'Waiting for delivery...'
            }
          </span>
        </div>
      )}
    </div>
  );
}
