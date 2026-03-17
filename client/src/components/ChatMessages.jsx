import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function MessageContent({ content, isUser }) {
  if (isUser) return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{content}</span>;
  return (
    <div className="message-markdown" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          ),
          strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
          em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className);
            return isBlock ? (
              <code className={className} style={{
                display: 'block',
                padding: '0.75rem 1rem',
                margin: '0.5rem 0',
                borderRadius: 6,
                background: 'var(--chat-bg)',
                fontSize: '0.9em',
                overflow: 'auto',
              }} {...props}>{children}</code>
            ) : (
              <code style={{
                padding: '0.15em 0.35em',
                borderRadius: 4,
                background: 'var(--chat-bg)',
                fontSize: '0.9em',
              }} {...props}>{children}</code>
            );
          },
          pre: ({ children }) => <pre style={{ margin: '0.4em 0', overflow: 'auto' }}>{children}</pre>,
          p: ({ children }) => <p style={{ margin: '0 0 0.4em 0', lineHeight: 1.55 }}>{children}</p>,
          ul: ({ children }) => <ul style={{ margin: '0.35em 0 0.45em', paddingLeft: '1.2em' }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '0.35em 0 0.45em', paddingLeft: '1.2em' }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: '0.2em', lineHeight: 1.55 }}>{children}</li>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function ChatMessages({ messages, loading, greetingMessage }) {
  if (!messages.length && !loading) {
    const hasCustom = greetingMessage?.trim();
    const title = hasCustom?.split('\n')[0]?.trim() || 'How can I help you today?';
    const restLines = hasCustom?.includes('\n') ? hasCustom.split('\n').slice(1).join('\n').trim() : null;
    const subtitle = restLines || (!hasCustom ? "I'm your AI sales assistant. Ask about services, pricing, or schedule a consultation." : null);
    return (
      <div className="d-flex flex-column align-items-center justify-content-center text-center py-5">
        <div
          className="rounded-circle d-flex align-items-center justify-content-center mb-3"
          style={{
            width: 64,
            height: 64,
            background: 'var(--chat-accent)',
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h5 className="mb-2" style={{ color: 'var(--chat-text-heading)' }}>{title}</h5>
        {subtitle && <p className="text-muted mb-0" style={{ whiteSpace: 'pre-wrap' }}>{subtitle}</p>}
      </div>
    );
  }

  return (
    <div className="container-fluid container-md">
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`d-flex mb-4 ${msg.role === 'user' ? 'justify-content-end' : ''}`}
        >
          <div
            className={`chat-bubble px-3 py-2 ${
              msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'
            }`}
          >
            <div className="message-content">
              <MessageContent content={msg.content} isUser={msg.role === 'user'} />
            </div>
          </div>
        </div>
      ))}
      {loading && (
        <div className="d-flex mb-4">
          <div
            className="chat-bubble chat-bubble-assistant px-3 py-2"
          >
            <span className="typing-dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
