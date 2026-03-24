import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const SA_TOKEN_KEY = 'super_admin_token';

const SuperAuthContext = createContext(null);

async function readJsonSafe(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const raw = await response.text().catch(() => '');
  if (!raw) return {};
  if (!contentType.includes('application/json')) {
    return {
      error: response.ok
        ? 'Server returned a non-JSON response.'
        : 'Server returned a non-JSON error response.',
      raw,
    };
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {
      error: response.ok
        ? 'Server returned invalid JSON.'
        : 'Server returned an invalid JSON error response.',
      raw,
    };
  }
}

function mapSuperAdminMe(d) {
  if (!d || typeof d !== 'object') return null;
  return {
    id: d.id,
    username: d.username,
    email: d.email ?? null,
    avatarUrl: d.avatarUrl ?? null,
  };
}

export function SuperAuthProvider({ children }) {
  const [token, setTokenState] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem(SA_TOKEN_KEY) : null
  );
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(() => !!localStorage.getItem(SA_TOKEN_KEY));

  const setToken = useCallback((t) => {
    setTokenState(t);
    if (t) {
      try { localStorage.setItem(SA_TOKEN_KEY, t); } catch {}
    } else {
      try { localStorage.removeItem(SA_TOKEN_KEY); } catch {}
      setAdmin(null);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setAdmin(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`${API_BASE}/super-admin/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Session invalid');
        return readJsonSafe(r);
      })
      .then((d) => setAdmin(mapSuperAdminMe(d)))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [token, setToken]);

  const refreshAdmin = useCallback(async () => {
    const storedToken = localStorage.getItem(SA_TOKEN_KEY);
    if (!storedToken) return;
    try {
      const r = await fetch(`${API_BASE}/super-admin/auth/me`, {
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      if (!r.ok) return;
      const d = await readJsonSafe(r);
      setAdmin(mapSuperAdminMe(d));
    } catch {
      /* ignore */
    }
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await fetch(`${API_BASE}/super-admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) throw new Error(data.error || 'Login failed');
    if (!data?.token) throw new Error(data.error || 'Login failed: missing token in server response');
    setToken(data.token);
  }, [setToken]);

  const logout = useCallback(async () => {
    const storedToken = localStorage.getItem(SA_TOKEN_KEY);
    try {
      await fetch(`${API_BASE}/super-admin/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${storedToken}` },
      });
    } catch {}
    setToken(null);
  }, [setToken]);

  const saFetch = useCallback((path, options = {}) => {
    const storedToken = localStorage.getItem(SA_TOKEN_KEY);
    const headers = { ...(options.headers || {}) };
    if (storedToken) headers.Authorization = `Bearer ${storedToken}`;
    return fetch(`${API_BASE}/super-admin${path}`, { ...options, headers });
  }, []);

  return (
    <SuperAuthContext.Provider
      value={{ token, admin, loading, login, logout, saFetch, refreshAdmin }}
    >
      {children}
    </SuperAuthContext.Provider>
  );
}

export function useSuperAuth() {
  const ctx = useContext(SuperAuthContext);
  if (!ctx) throw new Error('useSuperAuth must be used within SuperAuthProvider');
  return ctx;
}
