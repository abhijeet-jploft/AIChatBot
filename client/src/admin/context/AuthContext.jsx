import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const ADMIN_TOKEN_KEY = 'admin_token';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem(ADMIN_TOKEN_KEY) : null
  );
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(!!token);
  const [error, setError] = useState(null);

  const setToken = useCallback((t) => {
    setTokenState(t);
    if (t) {
      try { localStorage.setItem(ADMIN_TOKEN_KEY, t); } catch {}
    } else {
      try { localStorage.removeItem(ADMIN_TOKEN_KEY); } catch {}
      setCompany(null);
    }
  }, []);

  /** Super-admin “Open as company admin” passes a one-time token via localStorage + ?handoff= */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const hid = params.get('handoff');
    if (!hid) return;
    try {
      const raw = localStorage.getItem(`admin_handoff_${hid}`);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const { token: handoffToken, ts } = parsed;
      if (!handoffToken || typeof ts !== 'number') return;
      if (Date.now() - ts > 120000) {
        localStorage.removeItem(`admin_handoff_${hid}`);
        return;
      }
      localStorage.removeItem(`admin_handoff_${hid}`);
      localStorage.setItem(ADMIN_TOKEN_KEY, handoffToken);
      setTokenState(handoffToken);
      setLoading(true);
      const path = window.location.pathname || '/admin';
      window.history.replaceState({}, '', path);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/admin/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error('Session invalid');
        return r.json();
      })
      .then((d) =>
        setCompany({
          companyId: d.companyId,
          displayName: d.companyName || d.name,
          adminEmail: d.adminEmail ?? null,
        })
      )
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [token, setToken]);

  const login = useCallback(async (email, password) => {
    setError(null);
    const res = await fetch(`${API_BASE}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Login failed');
      throw new Error(data.error);
    }
    setToken(data.token);
    setCompany({
      companyId: data.companyId,
      displayName: data.companyName,
      adminEmail: data.adminEmail ?? null,
    });
  }, [setToken]);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/admin/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
    setToken(null);
  }, [token, setToken]);

  const authFetch = useCallback((path, options = {}) => {
    return fetch(`${API_BASE}/admin${path}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        token,
        company,
        loading,
        error,
        login,
        logout,
        authFetch,
        setError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
