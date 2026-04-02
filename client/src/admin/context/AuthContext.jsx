import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { mergeAdminVisibility } from '../../constants/adminVisibility';

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
          ownerName: d.ownerName ?? null,
          phone: d.phone ?? null,
          companyWebsite: d.companyWebsite ?? null,
          industryCategory: d.industryCategory ?? null,
          isSuspended: Boolean(d.isSuspended),
          embedPath: d.embedPath ?? null,
          embedUrl: d.embedUrl ?? null,
          embedSlug: d.embedSlug ?? null,
          adminVisibility: mergeAdminVisibility(d.adminVisibility),
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
      ownerName: data.ownerName ?? null,
      phone: data.phone ?? null,
      companyWebsite: data.companyWebsite ?? null,
      industryCategory: data.industryCategory ?? null,
      isSuspended: Boolean(data.isSuspended),
      embedPath: data.embedPath ?? null,
      embedUrl: data.embedUrl ?? null,
      embedSlug: data.embedSlug ?? null,
      adminVisibility: mergeAdminVisibility(data.adminVisibility),
    });
  }, [setToken]);

  const refreshProfile = useCallback(async () => {
    if (!token) return null;
    const r = await fetch(`${API_BASE}/admin/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const d = await readJsonSafe(r);
    setCompany({
      companyId: d.companyId,
      displayName: d.companyName || d.name,
      adminEmail: d.adminEmail ?? null,
      ownerName: d.ownerName ?? null,
      phone: d.phone ?? null,
      companyWebsite: d.companyWebsite ?? null,
      industryCategory: d.industryCategory ?? null,
      isSuspended: Boolean(d.isSuspended),
      embedPath: d.embedPath ?? null,
      embedUrl: d.embedUrl ?? null,
      embedSlug: d.embedSlug ?? null,
      adminVisibility: mergeAdminVisibility(d.adminVisibility),
    });
    return d;
  }, [token]);

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
    const { timeoutMs, signal: outerSignal, ...rest } = options;
    const headers = { ...(rest.headers || {}) };
    headers.Authorization = `Bearer ${token}`;

    let timer;
    let signal = outerSignal;
    if (timeoutMs != null && Number(timeoutMs) > 0) {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), Number(timeoutMs));
      if (outerSignal) {
        if (outerSignal.aborted) controller.abort();
        else outerSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      signal = controller.signal;
    }

    return fetch(`${API_BASE}/admin${path}`, {
      ...rest,
      headers,
      ...(signal ? { signal } : {}),
    }).finally(() => {
      if (timer) clearTimeout(timer);
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
        refreshProfile,
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
