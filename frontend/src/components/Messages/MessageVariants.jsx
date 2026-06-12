import { useState, useEffect } from 'react';
import { Mail, ArrowLeft, Send, XCircle } from 'lucide-react';
import MessageVariantCard from './MessageVariantCard';

// Regex to strip emojis
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{1F1E6}-\u{1F1FF}]/gu;

function getPreviewText(rawText, channel) {
  if (!rawText) return '';
  let text = rawText.replace(/Hi\s+(Marketer|Customer)/gi, 'Hi Rahul');
  text = text.replace(/\[Name\]/gi, 'Rahul').replace(/\{name\}/gi, 'Rahul');
  
  switch (channel) {
    case 'sms':
      text = text.replace(EMOJI_REGEX, '');
      text = text
        .replace(/discount code/gi, 'Code')
        .replace(/discount/gi, 'OFF')
        .replace(/percent/gi, '%')
        .replace(/favourites/gi, 'favs')
        .replace(/favourite/gi, 'fav')
        .replace(/receive/gi, 'get')
        .replace(/limited time/gi, 'ltd time');
      text = text.replace(/\s+/g, ' ').trim();
      break;
    case 'whatsapp':
      const codeRegex = /\b(?=[A-Z]*[0-9])(?=[0-9]*[A-Z])[A-Z0-9]{4,12}\b/g;
      text = text.replace(codeRegex, (match) => `*${match}*`);
      break;
    case 'email':
      text = `${text}\n\n---\nTo unsubscribe, click here: https://site.com/unsubscribe`;
      break;
    default:
      break;
  }
  return text;
}

/**
 * @param {Object} props
 * @param {Object} props.data - { variants: [...], recommended_variant, channel_recommendation }
 * @param {number|null} props.selectedIndex - Currently selected variant index
 * @param {Function} props.onSelect - (index) => void
 * @param {Function} props.onSend - Called when "Send Campaign" is clicked
 * @param {Function} props.onCancel - Terminate campaign workflow
 * @param {boolean} props.isSending - Loading state
 * @param {number} props.customerCount - Number of customers to send to
 */
export default function MessageVariants({
  data,
  selectedIndex,
  onSelect,
  onSend,
  onCancel,
  isSending,
  customerCount,
}) {
  console.log('📊 MessageVariants received data:', data);
  
  if (!data || !data.variants) {
    console.error('❌ Invalid data structure:', data);
    return <div style={{ padding: '16px', color: '#ff6b6b' }}>Error: No variants data</div>;
  }

  const { variants, recommended_variant } = data;
  const selectedVariant = selectedIndex != null ? variants[selectedIndex] : null;
  const [selectedChannel, setSelectedChannel] = useState('whatsapp');

  useEffect(() => {
    if (selectedVariant) {
      const recChannel = selectedVariant.channel_recommendation?.channel || 'whatsapp';
      setSelectedChannel(recChannel.toLowerCase());
    }
  }, [selectedIndex, selectedVariant]);

  return (
    <div className="variants-container">
      <div className="variants-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Mail size={16} />
        Choose a message variant for your campaign
      </div>

      {variants.map((variant, index) => (
        <MessageVariantCard
          key={index}
          variant={variant}
          selected={selectedIndex === index}
          recommended={recommended_variant === index + 1 || recommended_variant === index}
          onSelect={() => {
            console.log('🔴 MessageVariants: onSelect called with index:', index);
            onSelect(index);
          }}
        />
      ))}

      {selectedVariant && (
        <div style={{
          marginTop: '16px',
          padding: '16px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
        }}>
          {/* Channel dropdown */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Select Delivery Channel
            </label>
            <select
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                width: '100%',
                maxWidth: '240px',
                outline: 'none',
              }}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="rcs">RCS</option>
            </select>
          </div>

          {/* Formatted preview */}
          <div>
            <span style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Channel Format Preview
            </span>
            <div style={{
              padding: '12px',
              borderRadius: '6px',
              border: '1px dashed var(--border-default)',
              background: 'var(--bg-primary)',
              fontFamily: selectedChannel === 'sms' || selectedChannel === 'whatsapp' ? 'monospace' : 'inherit',
              fontSize: 'var(--font-sm)',
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
            }}>
              {getPreviewText(selectedVariant.message, selectedChannel)}
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="action-area" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-start', marginTop: '16px' }}>
        {selectedVariant ? (
          <>
            <button
              className="btn btn-ghost"
              onClick={() => onSelect(null)}
              disabled={isSending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={() => onSend(selectedVariant, selectedChannel)}
              disabled={isSending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {isSending ? (
                <>
                  <div className="spinner" />
                  Sending...
                </>
              ) : (
                <>
                  <Send size={14} />
                  Send to {customerCount} customers via {selectedChannel}
                </>
              )}
            </button>
          </>
        ) : (
          <button
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={isSending}
            style={{
              color: 'var(--red-500)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <XCircle size={14} />
            Cancel Campaign
          </button>
        )}
      </div>
    </div>
  );
}
