import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);
const TOKEN_KEY = 'token';
const ACTIVE_SESSION_KEY = 'active_session';

async function readApiResponse(response, fallbackMessage = 'Request failed.') {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();

  const text = await response.text();
  const trimmed = text.trim();
  const isHtml = trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html');
  throw new Error(
    isHtml
      ? 'The server returned an HTML page instead of API data. Refresh and try again in a few seconds. If it keeps happening, check the Render logs.'
      : trimmed || fallbackMessage
  );
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const getStoredToken = useCallback(
    () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY),
    []
  );

  const saveTokenForRole = useCallback((token, role) => {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);

    if (!token) return;

    const storage = role === 'admin' ? sessionStorage : localStorage;
    storage.setItem(TOKEN_KEY, token);
  }, []);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }

    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) {
          clearSession();
          return null;
        }
        return readApiResponse(r, 'Unable to restore your session.');
      })
      .then(data => {
        if (data) setUser({ ...data, token });
      })
      .catch(() => clearSession())
      .finally(() => setLoading(false));
  }, [clearSession, getStoredToken]);

  const login = useCallback(async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await readApiResponse(res, 'Login failed.');
    if (!res.ok) throw new Error(data.error || 'Login failed.');
    saveTokenForRole(data.token, data.role);
    setUser(data);
    return data;
  }, [saveTokenForRole]);

  const logout = useCallback(async () => {
    const token = getStoredToken();
    if (token) {
      try {
        await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      } catch {
        // Clear the local session even if the logout request fails.
      }
    }
    clearSession();
  }, [clearSession, getStoredToken]);

  const authFetch = useCallback(async (url, options = {}) => {
    const token = getStoredToken();
    const isFormData = options.body instanceof FormData;
    const headers = {
      Authorization: token ? `Bearer ${token}` : '',
      ...options.headers,
    };

    if (!isFormData && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) clearSession();
    return response;
  }, [clearSession, getStoredToken]);

  return (
    <AuthContext.Provider value={{ user, login, logout, authFetch, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
