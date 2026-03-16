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
      .then(setCompany)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [token, setToken]);

  const login = useCallback(async (companyId, password) => {
    setError(null);
    const res = await fetch(`${API_BASE}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Login failed');
      throw new Error(data.error);
    }
    setToken(data.token);
    setCompany({ companyId: data.companyId, displayName: data.companyName });
  }, [setToken]);

  const setup = useCallback(async (companyId, password) => {
    setError(null);
    const res = await fetch(`${API_BASE}/admin/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Setup failed');
      throw new Error(data.error);
    }
    setToken(data.token);
    setCompany({ companyId: data.companyId, displayName: data.companyName });
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
        setup,
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
