import { useState, useRef } from 'react';

export default function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="chat-input-shell px-3 px-md-4 py-3"
      style={{ background: 'var(--chat-bg)', flexShrink: 0 }}
    >
      <form onSubmit={handleSubmit}>
        <div
          className="d-flex align-items-end gap-2 rounded-3 border border-secondary overflow-hidden"
          style={{
            background: 'var(--chat-surface)',
            padding: '0.5rem 0.75rem',
          }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            disabled={disabled}
            rows={1}
            className="form-control border-0 flex-grow-1 bg-transparent"
            style={{
              resize: 'none',
              minHeight: 44,
              maxHeight: 200,
              color: 'var(--chat-text)',
            }}
          />
          <button
            type="submit"
            className="btn chat-send-btn rounded-2 px-3 py-2 text-white"
            disabled={disabled || !value.trim()}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
