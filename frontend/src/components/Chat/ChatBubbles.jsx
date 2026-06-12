// ─────────────────────────────────────────────────────────────
// src/components/Chat/ChatBubbles.jsx
// Message history display — user messages vs AI responses
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';

/**
 * @param {Object} props
 * @param {Array} props.messages - [{ id, role: 'user'|'ai', content, isError? }]
 * @param {boolean} props.isLoading - Show typing indicator for AI
 */
export default function ChatBubbles({ messages, isLoading, children }) {
  const bottomRef = useRef(null);

  // Auto-scroll to bottom on new messages, loading, or children changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, children]);

  return (
    <div className="chat-messages">
      {messages.map((msg) => (
        <div key={msg.id} className={`bubble-row ${msg.role}`}>
          {/* Avatar */}
          <div className={`bubble-avatar ${msg.role}`}>
            {msg.role === 'ai' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
            ) : (
              <span style={{ fontSize: '10px', fontWeight: 700 }}>Y</span>
            )}
          </div>

          {/* Bubble */}
          <div
            className={`bubble ${msg.role} ${msg.isError ? 'error' : ''}`}
            style={msg.isError ? { borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)' } : {}}
          >
            <div className="bubble-label">
              {msg.role === 'ai' ? 'Xeno AI' : 'You'}
            </div>
            {msg.content}
          </div>
        </div>
      ))}

      {/* Typing indicator */}
      {isLoading && (
        <div className="bubble-row ai">
          <div className="bubble-avatar ai">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
          </div>
          <div className="bubble ai">
            <div className="bubble-label">Xeno AI</div>
            <div className="typing-indicator">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </div>
        </div>
      )}

      {/* Contextual panels (Segment Preview, Message Variants, Dashboard, etc.) */}
      {children}

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  );
}
