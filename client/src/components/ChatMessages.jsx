import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatMessageDateTime } from '../utils/dateFormat';
import {
  buildLeadCaptureMessage,
  detectLeadCapturePrompt,
  extractLeadDraftFromMessages,
  hasLeadContactInMessages,
  preprocessAssistantMarkdown,
  sanitizeAssistantHref,
  userWantsToShareDetails,
} from '../lib/chatMessageFormatting';
import {
  COUNTRY_CODE_OPTIONS,
  splitPhoneForForm,
  validatePhone,
} from '../lib/contactValidation';

function isValidLeadEmail(rawEmail) {
  const email = String(rawEmail || '').trim();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function isValidLeadName(rawName) {
  const name = String(rawName || '').trim();
  if (name.length < 2 || name.length > 80) return false;
  try {
    return /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]{1,79}$/u.test(name);
  } catch {
    return /^[A-Za-z][A-Za-z\s.'-]{1,79}$/.test(name);
  }
}

function toLeadFormState(draft) {
  const parsed = splitPhoneForForm(draft?.phone || '', '+1');
  return {
    name: String(draft?.name || ''),
    phoneCode: String(draft?.phoneCode || parsed.countryCode || '+1'),
    phoneLocal: String(draft?.phoneLocal || parsed.localNumber || ''),
    email: String(draft?.email || ''),
  };
}

function InlineLeadForm({ draft, disabled, onSubmit }) {
  const [form, setForm] = useState(() => toLeadFormState(draft));
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(toLeadFormState(draft));
    setError('');
  }, [draft]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const next = {
      name: form.name.replace(/\s+/g, ' ').trim(),
      phoneCode: String(form.phoneCode || '').trim(),
      phoneLocal: String(form.phoneLocal || '').trim(),
      email: form.email.trim().toLowerCase(),
    };

    if (!next.name) {
      setError('Name is required.');
      return;
    }

    if (!isValidLeadName(next.name)) {
      setError('Please enter a valid name.');
      return;
    }

    if (next.email && !isValidLeadEmail(next.email)) {
      setError('Please enter a valid email address.');
      return;
    }

    const phoneCheck = validatePhone(next.phoneCode, next.phoneLocal);
    if (!phoneCheck.valid) {
      setError(phoneCheck.error || 'Please enter a valid phone number.');
      return;
    }

    if (!phoneCheck.normalized && !next.email) {
      setError('Add a phone number or email address.');
      return;
    }

    onSubmit(buildLeadCaptureMessage({
      name: next.name,
      phone: phoneCheck.normalized || '',
      email: next.email,
    }));
  };

  return (
    <form className="chat-inline-lead-form mt-3" onSubmit={handleSubmit}>
      <div className="chat-inline-lead-grid">
        <label className="chat-inline-lead-field">
          <span>Name</span>
          <input type="text" value={form.name} onChange={handleChange('name')} placeholder="Your name" disabled={disabled} />
        </label>
        <label className="chat-inline-lead-field chat-inline-lead-field-full">
          <span>Phone</span>
          <div className="chat-inline-lead-phone-row">
            <select
              value={form.phoneCode}
              onChange={handleChange('phoneCode')}
              className="chat-inline-lead-phone-code"
              disabled={disabled}
            >
              {COUNTRY_CODE_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>{option.label}</option>
              ))}
            </select>
            <input
              type="tel"
              value={form.phoneLocal}
              onChange={handleChange('phoneLocal')}
              className="chat-inline-lead-phone-local"
              placeholder="5551234567"
              disabled={disabled}
            />
          </div>
        </label>
        <label className="chat-inline-lead-field chat-inline-lead-field-full">
          <span>Email</span>
          <input type="email" value={form.email} onChange={handleChange('email')} placeholder="you@example.com" disabled={disabled} />
        </label>
      </div>
      {error ? <div className="chat-inline-lead-error">{error}</div> : null}
      <div className="chat-inline-lead-actions">
        <button type="submit" className="chat-inline-lead-submit" disabled={disabled}>Send details</button>
      </div>
    </form>
  );
}

function MessageContent({ content, isUser }) {
  if (isUser) return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{content}</span>;

  const markdown = preprocessAssistantMarkdown(content);

  return (
    <div className="message-markdown" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => {
            const safeHref = sanitizeAssistantHref(href);
            if (!safeHref) return <>{children}</>;
            const isExternal = /^https?:/i.test(safeHref);
            return (
              <a href={safeHref} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener noreferrer' : undefined} {...props}>
                {children}
              </a>
            );
          },
          strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
          em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
          h1: ({ children }) => <h1 className="message-heading message-heading-h1">{children}</h1>,
          h2: ({ children }) => <h2 className="message-heading message-heading-h2">{children}</h2>,
          h3: ({ children }) => <h3 className="message-heading message-heading-h3">{children}</h3>,
          h4: ({ children }) => <h4 className="message-heading message-heading-h4">{children}</h4>,
          h5: ({ children }) => <h5 className="message-heading message-heading-h5">{children}</h5>,
          h6: ({ children }) => <h6 className="message-heading message-heading-h6">{children}</h6>,
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
          p: ({ children }) => <p style={{ margin: '0 0 0.45em 0', lineHeight: 1.55 }}>{children}</p>,
          ul: ({ children }) => <ul style={{ margin: '0.35em 0 0.5em', paddingLeft: '1.15em' }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '0.35em 0 0.5em', paddingLeft: '1.2em' }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: '0.22em', lineHeight: 1.5 }}>{children}</li>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

export default function ChatMessages({ messages, loading, greetingMessage, onPlayVoice, onPauseVoice, playingMessageIndex, voiceEnabled, voiceResponseEnabled = true, onPlayBrowserVoice, onSend }) {
  const leadDraftRaw = extractLeadDraftFromMessages(messages);
  const parsedLeadPhone = splitPhoneForForm(leadDraftRaw.phone || '', '+1');
  const leadDraft = {
    ...leadDraftRaw,
    phone: leadDraftRaw.phone || '',
    phoneCode: parsedLeadPhone.countryCode || '+1',
    phoneLocal: parsedLeadPhone.localNumber || '',
  };
  const hasLeadContact = hasLeadContactInMessages(messages);
  const wantsToShareDetails = userWantsToShareDetails(messages);
  let leadPromptIndex = -1;

  if (!hasLeadContact) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (
        message?.role === 'assistant'
        && (
          detectLeadCapturePrompt(message.content)
          || (
            wantsToShareDetails
            && /\b(your name|full name|name\s*[:?]|phone|phone number|mobile|mobile number|whatsapp|email|email address|e-mail)\b/i.test(String(message.content || ''))
          )
        )
      ) {
        leadPromptIndex = index;
        break;
      }
    }
  }

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
            <div className={`chat-message-meta ${msg.role === 'user' ? 'user' : 'assistant'}`}>
              {formatMessageDateTime(msg.createdAt || msg.created_at)}
            </div>
            {msg.role === 'assistant' && i === leadPromptIndex && typeof onSend === 'function' ? (
              <InlineLeadForm draft={leadDraft} disabled={loading} onSubmit={onSend} />
            ) : null}
            {msg.role === 'assistant' && msg.content && voiceResponseEnabled && (Boolean(msg.voiceUrl) || typeof onPlayBrowserVoice === 'function') && (
              <div className="mt-2 d-inline-flex align-items-center gap-2">
                {playingMessageIndex === i ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm border-0 p-1 d-inline-flex align-items-center justify-content-center"
                      style={{
                        background: 'linear-gradient(135deg, var(--chat-launcher-gradient-start), var(--chat-launcher-gradient-end))',
                        color: 'var(--chat-header-text, white)',
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                      }}
                      onClick={() => onPauseVoice && onPauseVoice()}
                      aria-label="Stop"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M6 6h12v12H6z" />
                      </svg>
                    </button>
                    <span className="chat-mic-wave" style={{ color: 'var(--chat-accent)' }} aria-hidden>
                      <span />
                    </span>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm border-0 p-1 d-inline-flex align-items-center justify-content-center"
                    style={{
                      background: 'linear-gradient(135deg, var(--chat-launcher-gradient-start), var(--chat-launcher-gradient-end))',
                      color: 'var(--chat-header-text, white)',
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                    }}
                    onClick={() => {
                      if (msg.voiceUrl && onPlayVoice) onPlayVoice(msg.voiceUrl, i);
                      else if (onPlayBrowserVoice) onPlayBrowserVoice(msg.content, i);
                    }}
                    aria-label="Play response"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                )}
              </div>
            )}
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
