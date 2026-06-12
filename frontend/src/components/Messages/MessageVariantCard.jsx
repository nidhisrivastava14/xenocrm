// ─────────────────────────────────────────────────────────────
// src/components/Messages/MessageVariantCard.jsx
// Single message variant card (one of the 3 options)
// ─────────────────────────────────────────────────────────────

import { Zap, Sparkles, Gift, Smartphone, Mail, MessageSquare, Check } from 'lucide-react';

const TONE_CONFIG = {
  Urgent:   { icon: Zap, badgeClass: 'urgent',   psychology: 'Scarcity & urgency drive immediate action' },
  Personal: { icon: Sparkles, badgeClass: 'personal', psychology: 'Nostalgia & familiarity build emotional connection' },
  Value:    { icon: Gift, badgeClass: 'value',    psychology: 'Exclusivity & savings motivate re-engagement' },
};

/**
 * @param {Object} props
 * @param {Object} props.variant - { tone, message, cta, channel_recommendation, estimated_open_rate }
 * @param {boolean} props.selected - Is this variant currently selected?
 * @param {boolean} props.recommended - Is this the AI-recommended variant?
 * @param {Function} props.onSelect - Called when user clicks "Pick"
 */
export default function MessageVariantCard({ variant, selected, recommended, onSelect }) {
  const tone = TONE_CONFIG[variant.tone] || TONE_CONFIG.Urgent;
  
  const channelLower = (variant.channel_recommendation?.channel || 'WhatsApp').toLowerCase();
  const ChannelIcon = {
    whatsapp: MessageSquare,
    email: Mail,
    sms: Smartphone,
  }[channelLower] || Smartphone;

  return (
    <div
      className={`variant-card ${selected ? 'selected' : ''} ${recommended ? 'recommended' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
    >
      {/* Top row: tone badge + psychology */}
      <div className="variant-top">
        <span className={`variant-tone-badge ${tone.badgeClass}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          {tone.icon && <tone.icon size={12} />}
          {variant.tone}
        </span>
        <span className="variant-psychology">{tone.psychology}</span>
      </div>

      {/* Message text */}
      <div className="variant-message">
        {variant.message}
      </div>

      {/* Footer: channel + CTA + pick button */}
      <div className="variant-footer">
        <div className="variant-channel" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <ChannelIcon size={14} />
          <strong>{variant.channel_recommendation?.channel || 'WhatsApp'}</strong>
          {' · '}
          {variant.channel_recommendation?.estimated_open_rate || variant.estimated_open_rate || 'N/A'} open rate
        </div>

        {variant.cta && (
          <span className="variant-cta">CTA: "{variant.cta}"</span>
        )}

        <button
          className="variant-pick-btn"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          {selected ? (
            <>
              <Check size={12} />
              Selected
            </>
          ) : 'Pick'}
        </button>
      </div>
    </div>
  );
}
