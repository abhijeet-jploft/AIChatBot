import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function SuperToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextIdRef = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    if (!message) return;
    const id = nextIdRef.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 3800);
  }, [dismiss]);

  const value = useMemo(() => ({ showToast, dismiss }), [showToast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="sa-toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`sa-toast sa-toast-${t.type}`}>
            <span>{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useSuperToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useSuperToast must be used within SuperToastProvider');
  return ctx;
}
