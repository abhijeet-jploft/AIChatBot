import { COUNTRY_CODE_OPTIONS } from '../lib/contactValidation';

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
  return (
    <div style={{ display: 'flex', gap: 8, ...containerStyle }}>
      <select
        value={countryCode}
        onChange={(e) => onCountryCodeChange(e.target.value)}
        disabled={disabled}
        className={selectClassName}
        style={{ width: 132, minWidth: 132, maxWidth: 132, flex: '0 0 132px', ...selectStyle }}
        aria-label="Country code"
      >
        {COUNTRY_CODE_OPTIONS.map((opt) => (
          <option key={opt.code} value={opt.code}>{opt.label}</option>
        ))}
      </select>
      <input
        type="tel"
        value={localNumber}
        onChange={(e) => onLocalNumberChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        className={inputClassName}
        style={{ flex: '1 1 auto', minWidth: 220, ...inputStyle }}
      />
    </div>
  );
}
