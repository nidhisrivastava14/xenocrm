// ─────────────────────────────────────────────────────────────
// src/components/Dashboard/StatCard.jsx
// Single metric card — animates on value change
// ─────────────────────────────────────────────────────────────

import { memo, useState, useEffect, useRef } from 'react';
import { calcRate } from '../../utils/calculations';

/**
 * @param {Object} props
 * @param {React.ComponentType} props.icon - Lucide icon component
 * @param {string} props.label - "Delivered", "Opened", etc.
 * @param {number} props.value - Current count
 * @param {number} props.denominator - Total to calculate percentage from
 * @param {string} props.denominatorLabel - "total", "sent", etc.
 * @param {string} props.accentColor - CSS color for the left bar
 * @param {string} props.cardClass - CSS class for accent styling
 */
function StatCard({
  icon: IconComponent,
  label,
  value,
  denominator,
  denominatorLabel,
  accentColor,
  cardClass,
}) {
  const [isPulsing, setIsPulsing] = useState(false);
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);

  // ── Animate on value change ─────────────────────────────
  useEffect(() => {
    if (value !== prevValueRef.current) {
      setIsPulsing(true);

      const oldVal = prevValueRef.current;
      const diff = value - oldVal;
      const steps = Math.min(Math.abs(diff), 10);
      const stepDuration = 250 / Math.max(steps, 1);

      let step = 0;
      const interval = setInterval(() => {
        step++;
        const progress = step / steps;
        setDisplayValue(Math.round(oldVal + diff * progress));
        if (step >= steps) {
          clearInterval(interval);
          setDisplayValue(value);
        }
      }, stepDuration);

      prevValueRef.current = value;

      const pulseTimer = setTimeout(() => setIsPulsing(false), 600);
      return () => {
        clearInterval(interval);
        clearTimeout(pulseTimer);
      };
    }
  }, [value]);

  const rate = calcRate(value, denominator);

  return (
    <div className={`stat-card ${cardClass} ${isPulsing ? 'pulse' : ''}`} style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      textAlign: 'left',
      padding: '16px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '8px',
      position: 'relative',
      overflow: 'hidden',
      minHeight: '110px',
      justifyContent: 'space-between',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        fontSize: 'var(--font-xs)',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        <span>{label}</span>
        {IconComponent && <IconComponent size={16} style={{ color: 'var(--text-muted)' }} />}
      </div>
      
      <div className="stat-value" style={{
        fontSize: '32px',
        fontWeight: 700,
        color: 'var(--text-primary)',
        margin: '8px 0',
        lineHeight: 1,
      }}>
        {displayValue}
      </div>

      <div style={{
        fontSize: 'var(--font-xs)',
        color: 'var(--text-secondary)',
        fontWeight: 500,
      }}>
        {rate}% <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>of {denominator} {denominatorLabel}</span>
      </div>
    </div>
  );
}

export default memo(StatCard);
