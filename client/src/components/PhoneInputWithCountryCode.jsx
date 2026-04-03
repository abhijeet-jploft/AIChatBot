import { useState, useRef, useEffect } from 'react';
import { COUNTRY_CODE_OPTIONS } from '../lib/contactValidation';

function getShortLabel(opt) {
  const countryPart = opt.label.replace(/\s*\(.*\)/, '').trim();
  if (countryPart.length <= 3) return opt.label;
  return `${countryPart.slice(0, 2).toUpperCase()} (${opt.code})`;
}

export default function PhoneInputWithCountryCode({
  countryCode,
  onCountryCodeChange,
  localNumber,
  onLocalNumberChange,
  disabled = false,
  placeholder = 'Phone number',
  autoComplete = 'tel',
  selectClassName = '',
  inputClassName = '',
  containerStyle,
  selectStyle,
  inputStyle,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = COUNTRY_CODE_OPTIONS.find((o) => o.code === countryCode) || COUNTRY_CODE_OPTIONS[0];

  return (
    <div style={{ display: 'flex', gap: 8, ...containerStyle }}>
      <div ref={wrapRef} style={{ position: 'relative', width: 132, minWidth: 132, maxWidth: 132, flex: '0 0 132px', ...selectStyle }}>
        <button
          type="button"
          disabled={disabled}
          className={selectClassName}
          onClick={() => !disabled && setOpen((v) => !v)}
          style={{
            width: '100%',
            height: '100%',
            textAlign: 'left',
            cursor: disabled ? 'default' : 'pointer',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            ...(selectClassName ? {} : {
              background: 'var(--sa-bg, var(--chat-surface, #fff))',
              border: '1px solid var(--sa-border, var(--chat-border, #ccc))',
              borderRadius: 'var(--sa-radius, 6px)',
              padding: '6px 8px',
              fontSize: 'inherit',
              color: 'var(--sa-text, var(--chat-text, inherit))',
            }),
          }}
          aria-label="Country code"
        >
          {getShortLabel(selected)}
        </button>
        {open && (
          <ul
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 999,
              maxHeight: 220,
              overflowY: 'auto',
              margin: 0,
              padding: 0,
              listStyle: 'none',
              background: 'var(--sa-surface-2, var(--chat-surface, #fff))',
              border: '1px solid var(--sa-border, var(--chat-border, #ccc))',
              borderRadius: 'var(--sa-radius, 6px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              color: 'var(--sa-text, var(--chat-text, #222))',
            }}
          >
            {COUNTRY_CODE_OPTIONS.map((opt) => (
              <li
                key={opt.code}
                onClick={() => { onCountryCodeChange(opt.code); setOpen(false); }}
                style={{
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: 13,
                  background: opt.code === countryCode ? 'rgba(108,99,255,0.1)' : 'transparent',
                  color: 'inherit',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(108,99,255,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = opt.code === countryCode ? 'rgba(108,99,255,0.1)' : 'transparent'; }}
              >
                {opt.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      <input
        type="tel"
        value={localNumber}
        onChange={(e) => onLocalNumberChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        className={inputClassName}
        style={{ flex: '1 1 auto', minWidth: 0, ...inputStyle }}
      />
    </div>
  );
}
