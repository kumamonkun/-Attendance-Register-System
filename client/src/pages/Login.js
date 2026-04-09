import { useState } from 'react';
import { useAuth } from '../AuthContext';

export default function Login() {
  const { login, authFetch } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forceChange, setForceChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changeError, setChangeError] = useState('');

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      if (user.mustChangePassword) setForceChange(true);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const submitPasswordChange = async () => {
    setChangeError('');
    if (!newPassword || newPassword !== confirmPassword) return setChangeError('Passwords do not match.');
    if (newPassword.length < 6) return setChangeError('Password must be at least 6 characters.');
    if (newPassword === password) return setChangeError('New password must be different from your current password.');
    const res = await authFetch('/api/auth/change-password', {
      method: 'POST', body: JSON.stringify({ currentPassword: password, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) return setChangeError(data.error);
    window.location.reload();
  };

  if (forceChange) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 14, padding: 40, width: 380 }}>
          <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '12px 14px', marginBottom: 24 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#854d0e', marginBottom: 2 }}>Password change required</p>
            <p style={{ fontSize: 13, color: '#854d0e' }}>You are using a default password. Please set a new password before continuing.</p>
          </div>
          <div className="form-group">
            <label>New password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 6 characters" autoFocus />
          </div>
          <div className="form-group">
            <label>Confirm new password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitPasswordChange()} placeholder="Repeat password" />
          </div>
          {changeError && <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 10 }}>{changeError}</p>}
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={submitPasswordChange}>
            Set new password
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 14, padding: 40, width: 360 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Attendance Register</h1>
        <p style={{ fontSize: 14, color: '#888', marginBottom: 28 }}>Sign in to your account</p>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} placeholder="you@university.edu" autoFocus />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} placeholder="••••••••" />
        </div>
        {error && <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 12 }}>{error}</p>}
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} onClick={submit} disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}
