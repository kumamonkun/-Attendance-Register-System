import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';

export default function Users() {
  const { authFetch } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'lecturer' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => authFetch('/api/users').then(r => r.json()).then(setUsers);
  useEffect(() => { load(); }, []);

  const add = async () => {
    setMsg(''); setError('');
    if (!form.name || !form.email || !form.password) return setError('Fill in all fields.');
    const res = await authFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setMsg(`Account created for ${data.name}.`);
    setForm({ name: '', email: '', password: '', role: 'lecturer' });
    load();
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this user?')) return;
    await authFetch(`/api/users/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div>
      <h1 className="page-title">User accounts</h1>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-title">Add account</div>
        <div className="form-row">
          <div className="form-group">
            <label>Full name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Dr. Nakawa" />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="nakawa@university.edu" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
          </div>
          <div className="form-group">
            <label>Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="lecturer">Lecturer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        {msg && <p style={{ fontSize: 13, color: '#166534', marginBottom: 10 }}>{msg}</p>}
        {error && <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 10 }}>{error}</p>}
        <button className="btn btn-primary" onClick={add}>Create account</button>
      </div>

      <div className="card">
        <div className="card-title">All accounts ({users.length})</div>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td style={{ fontSize: 13, color: '#555' }}>{u.email}</td>
                <td>
                  <span className={`badge ${u.role === 'admin' ? 'badge-present' : 'badge-active'}`}>
                    {u.role}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: '#888' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td><button className="btn btn-danger btn-sm" onClick={() => remove(u.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
