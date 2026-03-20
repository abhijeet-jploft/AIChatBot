import { useState, useRef } from 'react';

export default function ChatInput({ onSend, disabled, showMic = true }) {
  const [value, setValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const shouldBeRecordingRef = useRef(false);

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

  const ensureRecognition = () => {
    if (typeof window === 'undefined') return null;
    if (recognitionRef.current) return recognitionRef.current;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal && result[0]?.transcript) {
          finalTranscript += result[0].transcript;
        }
      }
      if (finalTranscript.trim()) {
        setValue((prev) =>
          prev ? `${prev.trim()} ${finalTranscript.trim()}` : finalTranscript.trim()
        );
      }
    };

    recognition.onend = () => {
      // Keep listening until user explicitly stops
      if (shouldBeRecordingRef.current) {
        try {
          recognition.start();
        } catch {
          // ignore restart errors
        }
      } else {
        setIsRecording(false);
      }
    };

    recognition.onerror = () => {
      // On error, stop completely
      shouldBeRecordingRef.current = false;
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    return recognition;
  };

  const handleMicClick = () => {
    if (disabled) return;
    if (isRecording) {
      try {
        recognitionRef.current && recognitionRef.current.stop();
      } catch {
        // ignore
      }
      shouldBeRecordingRef.current = false;
      setIsRecording(false);
      return;
    }

    const recognition = ensureRecognition();
    if (!recognition) {
      // Browser doesn't support SpeechRecognition; fail silently.
      return;
    }

    try {
      shouldBeRecordingRef.current = true;
      recognition.start();
      setIsRecording(true);
    } catch {
      setIsRecording(false);
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
            placeholder="Type your message or use the mic…"
            disabled={disabled}
            rows={1}
            className="form-control border-0 flex-grow-1 bg-transparent"
            style={{
              resize: 'none',
              minHeight: 100,
              maxHeight: 200,
              color: 'var(--chat-text)',
            }}
          />
          {showMic && (
          <button
            type="button"
            className={`chat-mic-btn${isRecording ? ' is-recording' : ''}`}
            onClick={handleMicClick}
            aria-label={isRecording ? 'Stop voice input' : 'Start voice input'}
            disabled={disabled}
          >
            {isRecording ? (
              <span className="chat-mic-wave">
                <span />
              </span>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="8" y1="22" x2="16" y2="22" />
              </svg>
            )}
          </button>
          )}
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
