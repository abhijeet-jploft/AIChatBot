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
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <main
      className={`d-flex flex-column flex-grow-1 overflow-hidden ${compact ? 'chat-main-compact' : ''}`}
      style={{ background: 'var(--chat-bg)' }}
    >
      {showHeader && (
        <header
          className="chat-main-header d-flex align-items-center px-3 px-md-4 gap-2"
          style={{ background: 'var(--chat-surface)' }}
        >
          {companyIconUrl && (
            <img src={companyIconUrl} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
          )}
          <div>
            <span className="fw-semibold">{companyName}</span>
            <span className="ms-2 text-muted small">AI Sales Agent</span>
          </div>
        </header>
      )}

      <div
        className={`chat-main-scroll flex-grow-1 overflow-auto ${compact ? 'py-3 px-3' : 'py-4 px-3 px-md-4'}`}
        style={{ overflowX: 'hidden' }}
      >
        <ChatMessages messages={messages} loading={loading} greetingMessage={greetingMessage} />
        <div ref={bottomRef} />
      </div>

      <ChatInput onSend={onSend} disabled={loading} />
    </main>
  );
}
