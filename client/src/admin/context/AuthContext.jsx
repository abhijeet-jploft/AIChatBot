import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const ADMIN_TOKEN_KEY = 'admin_token';

const AuthContext = createContext(null);

/**
 * Super-admin "Open as company admin" stores a one-time payload in localStorage and opens
 * `/admin?handoff=…`. We must consume that synchronously before the first render, otherwise
 * AdminApp sees token=null and redirects to `/admin/login` before useEffect runs.
 */
function readInitialAdminToken() {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const hid = params.get('handoff');
    if (hid) {
      const raw = localStorage.getItem(`admin_handoff_${hid}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        const handoffToken = parsed?.token;
        const ts = parsed?.ts;
        if (handoffToken && typeof ts === 'number') {
          if (Date.now() - ts > 120000) {
            localStorage.removeItem(`admin_handoff_${hid}`);
          } else {
            localStorage.removeItem(`admin_handoff_${hid}`);
            localStorage.setItem(ADMIN_TOKEN_KEY, handoffToken);
            const path = window.location.pathname || '/admin';
            window.history.replaceState({}, '', path);
            return handoffToken;
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

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

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => readInitialAdminToken());
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(
    () => typeof window !== 'undefined' && !!localStorage.getItem(ADMIN_TOKEN_KEY)
  );
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
      .then(async (r) => {
        if (!r.ok) throw new Error('Session invalid');
        return await readJsonSafe(r);
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
    const data = await readJsonSafe(res);
    if (!res.ok) {
      setError(data.error || 'Login failed');
      throw new Error(data.error || 'Login failed');
    }
    if (!data?.token) {
      const message = data.error || 'Login failed: missing token in server response';
      setError(message);
      throw new Error(message);
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
