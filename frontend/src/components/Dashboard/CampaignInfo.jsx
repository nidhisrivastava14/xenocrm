// ─────────────────────────────────────────────────────────────
// src/components/Dashboard/CampaignInfo.jsx
// Campaign header — segment name, channel, tone, status badge
// ─────────────────────────────────────────────────────────────

import { MessageSquare, Mail, Smartphone, Target, Zap, Sparkles, Gift, Users, Clock } from 'lucide-react';
import { getCampaignStatus, getHealthColor } from '../../utils/calculations';

/**
 * @param {Object} props
 * @param {string} props.segmentName
 * @param {string} props.persona
 * @param {number} props.totalCustomers
 * @param {string} props.channel
 * @param {string} props.tone
 * @param {string} props.createdAt - ISO timestamp
 * @param {Object} props.stats - Current campaign stats
 * @param {boolean} props.isConnected - WebSocket status
 */
export default function CampaignInfo({
  segmentName,
  persona,
  totalCustomers,
  channel,
  tone,
  createdAt,
  stats,
  isConnected,
}) {
  const status = getCampaignStatus(stats, totalCustomers);

  const ChannelIcon = {
    whatsapp: MessageSquare,
    email: Mail,
    sms: Smartphone,
  }[channel] || Mail;

  const ToneIcon = {
    Urgent: Zap,
    Personal: Sparkles,
    Value: Gift,
  }[tone] || Mail;

  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Just now';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: '14px 16px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      marginBottom: 12,
    }}>
      {/* Row 1: Title + Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 'var(--font-md)', fontWeight: 700 }}>
            {segmentName || 'Campaign'}
          </div>
          {persona && (
            <span className="segment-badge" style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Target size={12} />
              {persona}
            </span>
          )}
        </div>

        {/* Status badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          borderRadius: 'var(--radius-full)',
          fontSize: 'var(--font-xs)',
          fontWeight: 600,
          background: status === 'complete'
            ? 'rgba(16, 185, 129, 0.12)'
            : 'rgba(59, 130, 246, 0.12)',
          color: status === 'complete' ? 'var(--green-500)' : 'var(--blue-400)',
          border: `1px solid ${status === 'complete' ? 'rgba(16,185,129,0.25)' : 'rgba(59,130,246,0.25)'}`,
        }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: status === 'complete' ? 'var(--green-500)' : 'var(--blue-400)',
            animation: status === 'sending' ? 'pulse-dot 1.5s infinite' : 'none',
          }} />
          {status === 'complete' ? 'Complete' : 'Sending...'}
        </div>
      </div>

      {/* Row 2: Meta chips */}
      <div style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <ChannelIcon size={12} />
          {channel}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <ToneIcon size={12} />
          {tone || 'Default'} tone
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Users size={12} />
          {totalCustomers} customers
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Clock size={12} />
          {formattedDate}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: isConnected ? 'var(--green-500)' : 'var(--text-muted)' }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isConnected ? 'var(--green-500)' : 'var(--text-muted)',
            display: 'inline-block'
          }} />
          {isConnected ? 'Live' : 'Offline'}
        </span>
      </div>
    </div>
  );
}
