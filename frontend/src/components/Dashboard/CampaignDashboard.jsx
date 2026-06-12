// ─────────────────────────────────────────────────────────────
// src/components/Dashboard/CampaignDashboard.jsx
// Full campaign dashboard — the "wow factor" live view
// ─────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { Send, CheckCircle2, Eye, MousePointerClick, AlertCircle, Mail, Plus } from 'lucide-react';
import CampaignInfo from './CampaignInfo';
import StatCard from './StatCard';
import EngagementTimeline from './EngagementTimeline';
import useWebSocket from '../../hooks/useWebSocket';

/**
 * @param {Object} props
 * @param {string} props.campaignId - Campaign UUID (from /api/campaigns/send)
 * @param {Object} props.segment - Segment data from /api/chat
 * @param {Object} props.variant - The selected message variant
 * @param {string} props.channel - "whatsapp" | "email" | "sms"
 * @param {string} props.createdAt - Campaign creation ISO timestamp
 * @param {Function} props.onNewCampaign - Reset and start over
 */
export default function CampaignDashboard({
  campaignId,
  segment,
  variant,
  channel,
  createdAt,
  onNewCampaign,
}) {
  const totalCustomers = segment?.count || segment?.preview?.length || 0;

  // ── WebSocket connection for real-time updates ──────────
  const ws = useWebSocket(campaignId);

  // ── Stat card definitions ───────────────────────────────
  const statCards = useMemo(() => [
    {
      icon: Send,
      label: 'Sent',
      value: ws.stats.total_sent || 0,
      denominator: totalCustomers,
      denominatorLabel: 'total',
      accentColor: 'var(--blue-500)',
      cardClass: 'sent',
    },
    {
      icon: CheckCircle2,
      label: 'Delivered',
      value: ws.stats.total_delivered || 0,
      denominator: totalCustomers,
      denominatorLabel: 'sent',
      accentColor: 'var(--green-500)',
      cardClass: 'delivered',
    },
    {
      icon: Eye,
      label: 'Opened',
      value: ws.stats.total_opened || 0,
      denominator: ws.stats.total_delivered || 0,
      denominatorLabel: 'delivered',
      accentColor: 'var(--purple-500)',
      cardClass: 'opened',
    },
    {
      icon: MousePointerClick,
      label: 'Clicked',
      value: ws.stats.total_clicked || 0,
      denominator: ws.stats.total_opened || 0,
      denominatorLabel: 'opened',
      accentColor: 'var(--orange-500)',
      cardClass: 'clicked',
    },
  ], [ws.stats, totalCustomers]);

  // ── Delivery progress ────────────────────────────────────
  const processed = (ws.stats.total_delivered || 0) + (ws.stats.total_failed || 0);
  const progressPct = totalCustomers > 0
    ? Math.min((processed / totalCustomers) * 100, 100)
    : 0;

  return (
    <div className="stats-dashboard">
      {/* ── Campaign header ─────────────────────────────────── */}
      <CampaignInfo
        segmentName={segment?.segment_name}
        persona={segment?.persona}
        totalCustomers={totalCustomers}
        channel={channel}
        tone={variant?.tone}
        createdAt={createdAt}
        stats={ws.stats}
        isConnected={ws.isConnected}
      />

      {/* ── Overall progress bar ────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}>
          <span style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Delivery Progress
          </span>
          <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
            {Math.round(progressPct)}%
          </span>
        </div>
        <div className="stats-progress">
          <div
            className="stats-progress-bar"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ── 4 Stat Cards ────────────────────────────────────── */}
      <div className="stats-grid">
        {statCards.map((card) => (
          <StatCard
            key={card.cardClass}
            {...card}
            lastUpdate={ws.lastUpdate}
          />
        ))}
      </div>

      {/* ── Channel-wise Breakdown ──────────────────────────── */}
      {ws.stats.by_channel && Object.keys(ws.stats.by_channel).some(k => ws.stats.by_channel[k].total_sent > 0) && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: 16,
          marginBottom: 12,
        }}>
          <div style={{
            fontSize: 'var(--font-xs)',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 10,
          }}>
            Channel Breakdown
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(ws.stats.by_channel).map(([chan, cStats]) => {
              if (cStats.total_sent === 0) return null;
              
              const labelMap = {
                sms: 'SMS',
                whatsapp: 'WhatsApp',
                email: 'Email',
                rcs: 'RCS'
              };
              const readLabel = chan === 'whatsapp' ? 'read' : (chan === 'email' ? 'opened' : 'opened/read');

              return (
                <div key={chan} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-primary)',
                  fontSize: 'var(--font-xs)',
                }}>
                  <strong style={{ textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                    {labelMap[chan] || chan}
                  </strong>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {cStats.total_sent} sent · {cStats.total_delivered} delivered
                    {chan !== 'sms' && ` · ${cStats.total_opened} ${readLabel}`}
                    {cStats.total_failed > 0 && ` · ${cStats.total_failed} failed`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Engagement Funnel ───────────────────────────────── */}
      <EngagementTimeline
        stats={ws.stats}
        totalCustomers={totalCustomers}
      />

      {/* ── Activity log (last 5 events) ────────────────────── */}
      {ws.events.length > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: 14,
          marginBottom: 12,
        }}>
          <div style={{
            fontSize: 'var(--font-xs)',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 8,
          }}>
            Recent Activity
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ws.events.slice(0, 5).map((evt) => {
              const Icon = {
                sent: Send,
                delivered: CheckCircle2,
                opened: Eye,
                clicked: MousePointerClick,
                failed: AlertCircle,
              }[evt.type] || Mail;

              return (
                <div key={evt.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-primary)',
                  fontSize: 'var(--font-xs)',
                  animation: 'bubble-in 0.2s ease-out',
                }}>
                  <span style={{ color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Icon size={12} style={{ color: 'var(--text-muted)' }} />
                    Message {evt.type}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── WebSocket disconnection warning ──────────────────── */}
      {!ws.isConnected && campaignId && (
        <div className="error-box" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertCircle size={14} style={{ color: 'var(--red-500)' }} />
          <span>Connection lost. Stats may not update.</span>
          <button
            className="btn btn-ghost"
            style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: 'var(--font-xs)' }}
            onClick={ws.reconnect}
          >
            Reconnect
          </button>
        </div>
      )}

      {/* ── Action buttons ──────────────────────────────────── */}
      <div className="action-area" style={{ justifyContent: 'center', gap: 12 }}>
        <button className="btn btn-ghost" onClick={onNewCampaign} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={14} /> New Campaign
        </button>
      </div>
    </div>
  );
}
