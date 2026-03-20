import { useRef, useEffect } from 'react';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';

export default function ChatMain({
  messages,
  loading,
  onSend,
  companyName,
  companyIconUrl,
  greetingMessage,
  showHeader = true,
  compact = false,
  scrollToLead = false,
  onScrolledToLead,
  showMic = true,
  onTypingChange,
  onPlayVoice,
  onPauseVoice,
  playingMessageIndex = null,
  voiceEnabled = false,
  voiceResponseEnabled = true,
  onPlayBrowserVoice,
}) {
  const scrollRef = useRef(null);
  const prevLoadingRef = useRef(loading);
  const prevMessageCountRef = useRef(messages.length);
  const scrollToLeadDoneRef = useRef(false);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const lastMessage = messages[messages.length - 1];
    const messageCountChanged = messages.length !== prevMessageCountRef.current;
    const loadingStarted = loading && !prevLoadingRef.current;

    if (!scrollEl) {
      prevLoadingRef.current = loading;
      prevMessageCountRef.current = messages.length;
      return;
    }

    if (scrollToLead && messages.length > 0 && !loading && !scrollToLeadDoneRef.current) {
      scrollToLeadDoneRef.current = true;
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
      if (typeof onScrolledToLead === 'function') {
        const t = setTimeout(onScrolledToLead, 400);
        return () => clearTimeout(t);
      }
    }

    if ((messageCountChanged && lastMessage?.role === 'user') || loadingStarted) {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
    }

    prevLoadingRef.current = loading;
    prevMessageCountRef.current = messages.length;
  }, [messages, loading, scrollToLead, onScrolledToLead]);

  return (
    <main
      className={`d-flex flex-column flex-grow-1 overflow-hidden ${compact ? 'chat-main-compact' : ''}`}
      style={{ background: 'var(--chat-bg)' }}
    >
      {showHeader && (
        <header
          className="chat-main-header d-flex align-items-center px-3 px-md-4 gap-2"
          style={{
            background: 'var(--chat-header-bg, var(--chat-surface))',
            color: 'var(--chat-header-text, var(--chat-text-heading))',
            boxShadow: 'var(--chat-header-shadow, none)',
          }}
        >
          {companyIconUrl && (
            <img src={companyIconUrl} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
          )}
          <div>
            <span className="fw-semibold" style={{ color: 'inherit' }}>{companyName}</span>
          </div>
        </header>
      )}

      <div
        ref={scrollRef}
        className={`chat-main-scroll flex-grow-1 overflow-auto ${compact ? 'py-3 px-3' : 'py-4 px-3 px-md-4'}`}
        style={{ overflowX: 'hidden' }}
      >
        <ChatMessages messages={messages} loading={loading} greetingMessage={greetingMessage} onPlayVoice={onPlayVoice} onPauseVoice={onPauseVoice} playingMessageIndex={playingMessageIndex} voiceEnabled={voiceEnabled} voiceResponseEnabled={voiceResponseEnabled} onPlayBrowserVoice={onPlayBrowserVoice} />
      </div>

      <ChatInput onSend={onSend} disabled={loading} showMic={showMic} onTypingChange={onTypingChange} />
    </main>
  );
}
