import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ChatMain from '../../components/ChatMain';
import { useAuth } from '../context/AuthContext';
import { buildCompanyThemeStyle } from '../../lib/companyThemeStyle';
import { resolveBrowserSpeechBCp47 } from '../../constants/chatLanguages';
import '../../index.css';

const THEME_KEY = 'ai-chat-theme';
const POLL_MS = 2500;
const OPERATE_KEEPALIVE_MS = 60_000; // re-ping operate every 60s to prevent TTL expiry

export default function AdminOperatorChat() {
  const { sessionId } = useParams();
  const { authFetch } = useAuth();
  const [settings, setSettings] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || 'light';
    } catch {
      return 'light';
    }
  });

  const responseAudioRef = useRef(null);
  const speechUtteranceRef = useRef(null);
  const [playingMessageIndex, setPlayingMessageIndex] = useState(null);
  const [pendingOutbox, setPendingOutbox] = useState([]);

  const stripEmoji = useCallback((text) => {
    try {
      return String(text || '').replace(/\p{Emoji}/gu, '').replace(/\s+/g, ' ').trim();
    } catch {
      return String(text || '').trim();
    }
  }, []);

  const stripLeadingInvisible = useCallback((str) => String(str || '').replace(/^[\s\uFEFF\u200B-\u200D\u2060\u00AD]*/, ''), []);

  const sanitizeSpeechText = useCallback(
    (text, options = {}) => {
      let out = stripLeadingInvisible(String(text || ''))
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
        .replace(/^\s{0,3}(#{1,6}|[-*+])\s+/gm, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (options.ignoreEmoji) out = stripEmoji(out);
      return out;
    },
    [stripEmoji, stripLeadingInvisible]
  );

  const getPreferredBrowserVoice = useCallback((gender, preferredBcp47) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const allVoices = window.speechSynthesis.getVoices() || [];
    if (!allVoices.length) return null;
    const want = String(preferredBcp47 || 'en-US').trim();
    const prefix = want.split('-')[0].toLowerCase();
    const langVoices = allVoices.filter((v) => String(v.lang || '').toLowerCase().startsWith(prefix));
    const pool = langVoices.length ? langVoices : allVoices;
    const femaleHint = /(female|woman|zira|susan|samantha|aria|eva|linda|hazel|jenny|karen|emma|alloy)/i;
    const maleHint = /(male|man|david|mark|alex|guy|daniel|george|james|tom|ryan|adam)/i;
    const matcher = String(gender || 'female').toLowerCase() === 'male' ? maleHint : femaleHint;
    return pool.find((v) => matcher.test(v.name || '')) || pool[0] || null;
  }, []);

  const speakWithBrowserVoice = useCallback(
    (text, gender = 'female', ignoreEmoji = false, onEnd, localeOpts = {}) => {
      if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance === 'undefined') {
        return;
      }
      const speechText = sanitizeSpeechText(text, { ignoreEmoji });
      if (!speechText) return;
      const bcp47 = resolveBrowserSpeechBCp47(speechText, localeOpts.companyLangCode, localeOpts.ttsOverride);
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(speechText);
        const selectedVoice = getPreferredBrowserVoice(gender, bcp47);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          utterance.lang = selectedVoice.lang || bcp47;
        } else {
          utterance.lang = bcp47;
        }
        const isMale = String(gender || '').toLowerCase() === 'male';
        utterance.pitch = isMale ? 0.9 : 1.1;
        utterance.rate = 1;
        utterance.onend = () => {
          if (speechUtteranceRef.current === utterance) speechUtteranceRef.current = null;
          if (typeof onEnd === 'function') onEnd();
        };
        utterance.onerror = () => {
          if (speechUtteranceRef.current === utterance) speechUtteranceRef.current = null;
          if (typeof onEnd === 'function') onEnd();
        };
        speechUtteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      } catch {
        if (typeof onEnd === 'function') onEnd();
      }
    },
    [getPreferredBrowserVoice, sanitizeSpeechText]
  );

  const pauseAssistantVoice = useCallback(() => {
    try {
      if (responseAudioRef.current) {
        responseAudioRef.current.pause();
        responseAudioRef.current.src = '';
        responseAudioRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
      speechUtteranceRef.current = null;
    } catch {
      /* ignore */
    }
    setPlayingMessageIndex(null);
  }, []);

  const playAssistantVoice = useCallback((audioDataUrl, messageIndex) => {
    if (!audioDataUrl || typeof window === 'undefined') return;
    try {
      if (responseAudioRef.current) {
        responseAudioRef.current.pause();
        responseAudioRef.current = null;
      }
      setPlayingMessageIndex(messageIndex ?? null);
      const audio = new Audio(audioDataUrl);
      responseAudioRef.current = audio;
      const clearPlaying = () => {
        if (responseAudioRef.current === audio) responseAudioRef.current = null;
        setPlayingMessageIndex(null);
      };
      audio.onended = clearPlaying;
      audio.onerror = clearPlaying;
      audio.play().catch(clearPlaying);
    } catch {
      setPlayingMessageIndex(null);
    }
  }, []);

  useEffect(() => {
    return () => {
      pauseAssistantVoice();
    };
  }, [pauseAssistantVoice]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    authFetch('/settings')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Settings failed'))))
      .then(setSettings)
      .catch(() => setSettings(null));
  }, [authFetch]);

  // Mark session as admin-operated on mount; release on unmount; keep-alive ping
  useEffect(() => {
    if (!sessionId) return undefined;
    const mark = () => authFetch(`/conversations/${sessionId}/operate`, { method: 'POST' }).catch(() => {});
    mark();
    const keepAlive = setInterval(mark, OPERATE_KEEPALIVE_MS);
    return () => {
      clearInterval(keepAlive);
      authFetch(`/conversations/${sessionId}/release`, { method: 'POST' }).catch(() => {});
    };
  }, [authFetch, sessionId]);

  const toOperatorPerspectiveRole = useCallback((role) => {
    // DB perspective: user=visitor, assistant=AI/admin.
    // Operator view should render visitor on left and operator on right.
    return role === 'user' ? 'assistant' : 'user';
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await authFetch(`/conversations/${sessionId}/messages`);
      if (!res.ok) {
        if (res.status === 404) setLoadError('Conversation not found.');
        else setLoadError('Could not load messages.');
        return;
      }
      const data = await res.json();
      const next = Array.isArray(data)
        ? data.map((m) => ({ role: toOperatorPerspectiveRole(m.role), content: m.content, createdAt: m.created_at || m.createdAt }))
        : [];
      setMessages([...next, ...pendingOutbox]);
      setLoadError(null);
    } catch {
      setLoadError((prev) => prev || 'Could not load messages.');
    }
  }, [authFetch, sessionId, pendingOutbox, toOperatorPerspectiveRole]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!sessionId) return undefined;
    const t = setInterval(fetchMessages, POLL_MS);
    return () => clearInterval(t);
  }, [sessionId, fetchMessages]);

  const sendOperatorMessage = async (content) => {
    const text = String(content || '').trim();
    if (!text || !sessionId || sending) return;
    setSending(true);
    const optimistic = { role: 'user', content: text };
    setPendingOutbox((prev) => [...prev, optimistic]);
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await authFetch(`/conversations/${sessionId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) throw new Error('send failed');
      setPendingOutbox([]);
      await fetchMessages();
    } catch {
      setPendingOutbox((prev) => prev.filter((m, idx) => idx !== prev.length - 1));
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Could not send message. Try again.' }]);
    } finally {
      setSending(false);
    }
  };

  const chatbotTitle =
    settings?.chatbotName?.trim() ||
    settings?.displayName?.trim() ||
    settings?.companyName ||
    settings?.name ||
    'Chat';
  const companyIconUrl = settings?.iconUrl || null;
  const greetingMessage = settings?.greetingMessage || null;
  const voiceEnabled = Boolean(settings?.voice?.enabled);
  const voiceResponseEnabled = settings?.voice?.responseEnabled !== false;
  const voiceGender = settings?.voice?.gender === 'male' ? 'male' : 'female';
  const ignoreEmoji = Boolean(settings?.voice?.ignoreEmoji);

  const companyThemeStyle = buildCompanyThemeStyle(settings?.theme, theme);

  const handlePlayBrowserVoice = useCallback(
    (content, messageIndex) => {
      if (!content) return;
      setPlayingMessageIndex(messageIndex ?? null);
      speakWithBrowserVoice(
        content,
        voiceGender,
        ignoreEmoji,
        () => setPlayingMessageIndex(null),
        {
          companyLangCode: settings?.language?.primary,
          ttsOverride: settings?.voice?.ttsLanguageCode,
        }
      );
    },
    [voiceGender, ignoreEmoji, speakWithBrowserVoice, settings?.language?.primary, settings?.voice?.ttsLanguageCode]
  );

  if (!sessionId) {
    return (
      <div className="p-4" style={{ color: 'var(--chat-text)' }}>
        <p>Invalid session.</p>
        <Link to="/admin/take-over">Back to Take over</Link>
      </div>
    );
  }

  return (
    <div
      className="chat-shell d-flex flex-column overflow-hidden"
      style={{ ...(companyThemeStyle || {}), minHeight: '100dvh', background: 'var(--chat-bg)' }}
    >
      <div
        className="d-flex align-items-center justify-content-between gap-2 px-3 py-2 border-bottom flex-shrink-0"
        style={{ borderColor: 'var(--chat-border)', background: 'var(--chat-surface)' }}
      >
        <div className="d-flex align-items-center gap-2 min-w-0">
          <Link to="/admin/take-over" className="btn btn-sm btn-outline-secondary">
            ← Take over
          </Link>
          <Link to="/admin/conversations" className="btn btn-sm btn-outline-secondary d-none d-sm-inline-block">
            Conversations
          </Link>
          <span className="small text-truncate" style={{ color: 'var(--chat-muted)' }} title={sessionId}>
            Session: <code className="text-break">{sessionId}</code>
          </span>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="small d-none d-md-inline" style={{ color: 'var(--chat-muted)' }}>
            Visitor messages are on left · your operator replies are on right
          </span>
          <button
            type="button"
            className={`btn btn-sm ${theme === 'dark' ? 'btn-outline-light' : 'btn-outline-dark'}`}
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="alert alert-warning m-3 mb-0 py-2 small" role="alert">
          {loadError}
        </div>
      )}

      <div className="flex-grow-1 d-flex flex-column overflow-hidden" style={{ minHeight: 0 }}>
        <ChatMain
          messages={messages}
          loading={sending}
          onSend={sendOperatorMessage}
          companyName={chatbotTitle}
          companyIconUrl={companyIconUrl}
          greetingMessage={greetingMessage}
          showMic={voiceEnabled}
          onPlayVoice={playAssistantVoice}
          onPauseVoice={pauseAssistantVoice}
          playingMessageIndex={playingMessageIndex}
          voiceEnabled={voiceEnabled}
          voiceResponseEnabled={voiceResponseEnabled}
          onPlayBrowserVoice={handlePlayBrowserVoice}
        />
      </div>
    </div>
  );
}
