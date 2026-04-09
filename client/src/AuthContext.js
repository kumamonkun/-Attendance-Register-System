import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
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
        return r.json();
      })
      .then(data => {
        if (data) setUser({ ...data, token });
      })
      .finally(() => setLoading(false));
  }, [clearSession]);

  const login = useCallback(async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed.');
    localStorage.setItem('token', data.token);
    setUser(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      } catch {
        // Clear the local session even if the logout request fails.
      }
    }
    clearSession();
  }, [clearSession]);

  const authFetch = useCallback(async (url, options = {}) => {
    const token = localStorage.getItem('token');
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
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, login, logout, authFetch, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
