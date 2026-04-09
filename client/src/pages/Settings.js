import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';

export default function Settings() {
  const { user, authFetch } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [networkForm, setNetworkForm] = useState({ publicAppUrl: '' });
  const [networkInfo, setNetworkInfo] = useState(null);
  const [networkMsg, setNetworkMsg] = useState('');
  const [networkError, setNetworkError] = useState('');
  const [networkLoading, setNetworkLoading] = useState(false);
  const [networkSaving, setNetworkSaving] = useState(false);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    let ignore = false;

    const loadNetworkSettings = async () => {
      setNetworkLoading(true);
      setNetworkError('');

      try {
        const res = await authFetch('/api/settings/network');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load scan access settings.');
        if (ignore) return;

        setNetworkInfo(data);
        setNetworkForm({ publicAppUrl: data.publicAppUrl || '' });
      } catch (loadError) {
        if (!ignore) setNetworkError(loadError.message || 'Could not load scan access settings.');
      } finally {
        if (!ignore) setNetworkLoading(false);
      }
    };

    loadNetworkSettings();
    return () => { ignore = true; };
  }, [authFetch]);

  const changePassword = async () => {
    setMsg('');
    setError('');
    if (!form.currentPassword || !form.newPassword) return setError('Fill in all fields.');
    if (form.newPassword !== form.confirmPassword) return setError('New passwords do not match.');
    if (form.newPassword.length < 6) return setError('New password must be at least 6 characters.');

    setLoading(true);
    const res = await authFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else {
      setMsg('Password changed successfully.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    }
    setLoading(false);
  };

  const saveNetworkSettings = async () => {
    setNetworkMsg('');
    setNetworkError('');
    setNetworkSaving(true);

    try {
      const res = await authFetch('/api/settings/network', {
        method: 'POST',
        body: JSON.stringify({ publicAppUrl: networkForm.publicAppUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save scan access settings.');

      setNetworkInfo(data);
      setNetworkForm({ publicAppUrl: data.publicAppUrl || '' });
      setNetworkMsg(data.publicAppUrl
        ? 'Public scan URL saved. New sessions and refreshed QR codes will use it.'
        : 'Public scan URL cleared. QR codes will fall back to the local network address.');
    } catch (saveError) {
      setNetworkError(saveError.message || 'Could not save scan access settings.');
    } finally {
      setNetworkSaving(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Account settings</h1>

      <div className="card" style={{ maxWidth: 480 }}>
        <div className="card-title">Your account</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: isAdmin ? '#dcfce7' : '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: isAdmin ? '#166534' : '#1e40af' }}>
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: 15 }}>{user?.name}</p>
            <p style={{ fontSize: 13, color: '#888' }}>{user?.email}</p>
            <span style={{ fontSize: 11, background: isAdmin ? '#dcfce7' : '#dbeafe', color: isAdmin ? '#166534' : '#1e40af', padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>
              {user?.role}
            </span>
          </div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 680 }}>
        <div className="card-title">Student scan access</div>
        <p style={{ fontSize: 14, color: '#555', marginBottom: 12, lineHeight: 1.6 }}>
          Students on mobile data or a different Wi-Fi can only scan successfully if the QR code points to a public app address.
          If this is blank, the app uses the lecturer&apos;s local network address and students must be on the same network.
        </p>

        {networkLoading ? (
          <p style={{ fontSize: 13, color: '#888' }}>Loading scan access settings...</p>
        ) : (
          <>
            <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <p style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                Current QR destination
              </p>
              <p style={{ fontSize: 14, fontWeight: 600, wordBreak: 'break-all' }}>
                {networkInfo?.effectiveScanBaseUrl || 'Not available'}
              </p>
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                Source: {networkInfo?.source === 'environment' ? 'server environment variable' : networkInfo?.source === 'settings' ? 'saved app setting' : 'local network fallback'}
              </p>
            </div>

            {!isAdmin ? (
              <p style={{ fontSize: 13, color: '#888' }}>
                Ask an administrator to configure the public app URL if students need to scan while using mobile data or another network.
              </p>
            ) : (
              <>
                <div className="form-group">
                  <label>Public app URL</label>
                  <input
                    value={networkForm.publicAppUrl}
                    onChange={e => setNetworkForm({ publicAppUrl: e.target.value })}
                    placeholder="https://attendance.example.com"
                    disabled={networkInfo?.lockedByEnv}
                  />
                </div>
                <p style={{ fontSize: 12, color: '#888', marginTop: -6, marginBottom: 14, lineHeight: 1.5 }}>
                  Use the public address that students can open from anywhere.
                  This can be a hosted domain or a secure tunnel URL that points to the React app.
                  New sessions and QR refreshes will use this address.
                </p>
                {networkInfo?.lockedByEnv && (
                  <p style={{ fontSize: 13, color: '#854d0e', marginBottom: 12 }}>
                    This setting is locked because `PUBLIC_APP_URL` is already set on the server.
                  </p>
                )}
                {networkError && <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 10 }}>{networkError}</p>}
                {networkMsg && <p style={{ fontSize: 13, color: '#166534', marginBottom: 10 }}>{networkMsg}</p>}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" className="btn btn-primary" onClick={saveNetworkSettings} disabled={networkSaving || networkInfo?.lockedByEnv}>
                    {networkSaving ? 'Saving...' : 'Save public URL'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setNetworkForm({ publicAppUrl: '' })}
                    disabled={networkSaving || networkInfo?.lockedByEnv}>
                    Clear
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <div className="card-title">Change password</div>
        <div className="form-group">
          <label>Current password</label>
          <input
            type="password"
            value={form.currentPassword}
            onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))}
            placeholder="........"
          />
        </div>
        <div className="form-group">
          <label>New password</label>
          <input
            type="password"
            value={form.newPassword}
            onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
            placeholder="........"
          />
        </div>
        <div className="form-group">
          <label>Confirm new password</label>
          <input
            type="password"
            value={form.confirmPassword}
            onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
            placeholder="........"
          />
        </div>
        {error && <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 10 }}>{error}</p>}
        {msg && <p style={{ fontSize: 13, color: '#166534', marginBottom: 10 }}>{msg}</p>}
        <button type="button" className="btn btn-primary" onClick={changePassword} disabled={loading}>
          {loading ? 'Saving...' : 'Change password'}
        </button>
      </div>
    </div>
  );
}
