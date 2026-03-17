import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const AdminToastContext = createContext(null);

function buildToast(id, message, type) {
  return {
    id,
    message,
    type: type || 'info',
  };
}

export function AdminToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextIdRef = useRef(1);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    if (!message) return;

    const id = nextIdRef.current;
    nextIdRef.current += 1;

    setToasts((prev) => [...prev, buildToast(id, message, type)]);
    setTimeout(() => dismissToast(id), 3800);
  }, [dismissToast]);

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <AdminToastContext.Provider value={value}>
      {children}
      <div className="admin-toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`admin-toast admin-toast-${toast.type}`}>
            <span className="admin-toast-text">{toast.message}</span>
            <button
              type="button"
              className="admin-toast-close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
            >
              x
            </button>
          </div>
        ))}
      </div>
    </AdminToastContext.Provider>
  );
}

export function useAdminToast() {
  const ctx = useContext(AdminToastContext);
  if (!ctx) throw new Error('useAdminToast must be used within AdminToastProvider');
  return ctx;
}
