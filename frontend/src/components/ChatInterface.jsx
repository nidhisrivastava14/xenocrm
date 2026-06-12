// ─────────────────────────────────────────────────────────────
// src/components/ChatInterface.jsx
// Main orchestrator — drives the entire campaign flow:
//   chat → segment preview → message variants → send → dashboard
//
// Each "step" renders different sub-components while keeping
// the full chat history visible above.
// ─────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import ChatBubbles from './Chat/ChatBubbles';
import ChatInput from './Chat/ChatInput';
import SegmentPreview from './Segment/SegmentPreview';
import MessageVariants from './Messages/MessageVariants';
import CampaignDashboard from './Dashboard/CampaignDashboard';
import useChat from '../hooks/useChat';
import useCampaign from '../hooks/useCampaign';

/**
 * Steps:
 *   'chat'      – Marketer describes their audience
 *   'preview'   – AI shows the segment + customer preview
 *   'messages'  – 3 message variants to choose from
 *   'sending'   – Campaign is being dispatched
 *   'dashboard' – Real-time delivery stats
 */
export default function ChatInterface() {
  const [step, setStep] = useState('chat');

  // Track the selected variant + channel for dashboard display
  const sentVariantRef = useRef(null);
  const sentChannelRef = useRef('whatsapp');
  const sentAtRef = useRef(null);

  // ── Hooks ────────────────────────────────────────────────
  const chat = useChat();
  const campaign = useCampaign();

  // ── Step 1: Send chat message ────────────────────────────
  const handleSendMessage = useCallback(async (text) => {
    await chat.sendMessage(text);
    // Transition happens when segment appears (below)
  }, [chat]);

  // When segment is found, auto-advance to preview step
  const segment = chat.segment;
  if (segment && step === 'chat') {
    // Schedule step change (can't setState during render)
    setTimeout(() => setStep('preview'), 0);
  }

  // ── Step 2: Generate messages from segment ───────────────
  const handleGenerateMessages = useCallback(async () => {
    if (!segment) return;
    try {
      console.log("GENERATING MESSAGES: Calling campaign.generateMessages");
      await campaign.generateMessages(segment);
      setStep('messages');
    } catch (err) {
      console.error("GENERATING MESSAGES ERROR:", err);
    }
  }, [segment, campaign]);

  // ── Step 3: Send campaign ────────────────────────────────
  const handleSendCampaign = useCallback(async (variant, channel) => {
    if (!segment) return;
    console.log("STEP 1 handleSendCampaign");
    sentVariantRef.current = variant;
    sentChannelRef.current = channel;
    sentAtRef.current = new Date().toISOString();
    setStep('sending');
    try {
      console.log("STEP 2 dispatchCampaign");
      await campaign.dispatchCampaign(segment, variant, channel);
      console.log("STEP 4 campaign created");
      setStep('dashboard');
    } catch (err) {
      console.error("CAMPAIGN SEND ERROR IN STEP 3:", err);
      setStep('messages'); // Go back on error
    }
  }, [segment, campaign]);

  // ── Reset everything ─────────────────────────────────────
  const handleNewCampaign = useCallback(() => {
    chat.resetChat();
    campaign.resetCampaign();
    sentVariantRef.current = null;
    sentChannelRef.current = 'whatsapp';
    sentAtRef.current = null;
    setStep('chat');
  }, [chat, campaign]);

  // ── Determine which input to show ────────────────────────
  const showChatInput = step === 'chat';
  const showSegmentPreview = step === 'preview' && segment;
  const showMessageVariants = step === 'messages' && campaign.variants;
  const showDashboard = (step === 'dashboard' || step === 'sending') && campaign.campaignId;

  return (
    <div className="chat-container">
      {/* ── Message history ─────────────────────────────────── */}
      <ChatBubbles
        messages={chat.messages}
        isLoading={chat.isLoading || step === 'sending'}
      >
        {/* ── Contextual panels (inside the scroll area) ─────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>

          {/* Segment Preview */}
          {showSegmentPreview && (
            <SegmentPreview
              segment={segment}
              onContinue={handleGenerateMessages}
              onCancel={handleNewCampaign}
              isGenerating={campaign.isGenerating}
            />
          )}

          {/* Message Variants */}
          {showMessageVariants && (
            <MessageVariants
              data={campaign.variants}
              selectedIndex={campaign.selectedVariant}
              onSelect={campaign.setSelectedVariant}
              onSend={handleSendCampaign}
              onCancel={handleNewCampaign}
              isSending={campaign.isSending}
              customerCount={segment?.count || 0}
            />
          )}

          {/* Sending State Card */}
          {step === 'sending' && (
            <div className="sending-card">
              <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3, marginBottom: 8 }} />
              <h3>Sending campaign...</h3>
              <p>Queueing campaign messages for {segment?.count || 5} customers via {sentChannelRef.current}...</p>
            </div>
          )}

          {/* Error display */}
          {campaign.error && (
            <div className="error-box">
              <AlertCircle size={16} /> {campaign.error}
            </div>
          )}

          {/* Live Dashboard */}
          {showDashboard && (
            <CampaignDashboard
              campaignId={campaign.campaignId}
              segment={segment}
              variant={sentVariantRef.current}
              channel={sentChannelRef.current}
              createdAt={sentAtRef.current}
              onNewCampaign={handleNewCampaign}
            />
          )}
        </div>
      </ChatBubbles>

      {/* ── Chat input (only shown during chat step) ────────── */}
      {showChatInput && (
        <ChatInput
          onSend={handleSendMessage}
          disabled={chat.isLoading}
          placeholder="e.g. I want to win back customers who haven't bought in 60 days..."
        />
      )}
    </div>
  );
}
