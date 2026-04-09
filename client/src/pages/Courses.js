import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';

export default function Courses() {
  const { authFetch, user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ code: '', name: '', lecturer: '', lecturerId: '' });
  const [msg, setMsg] = useState('');

  const load = () => {
    authFetch('/api/courses').then(r => r.json()).then(setCourses);
    if (user.role === 'admin') {
      authFetch('/api/users').then(r => r.json()).then(u => {
        const lecturers = u.filter(x => x.role === 'lecturer');
        setUsers(lecturers);
        if (lecturers.length > 0) setForm(f => ({ ...f, lecturerId: lecturers[0].id, lecturer: lecturers[0].name }));
      });
    }
  };
  useEffect(load, []);

  const add = async () => {
    if (!form.code || !form.name) return setMsg('Fill in all fields.');
    const res = await authFetch('/api/courses', { method: 'POST', body: JSON.stringify(form) });
    if (res.ok) { setMsg('Course added.'); setForm(f => ({ ...f, code: '', name: '' })); load(); }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this course?')) return;
    await authFetch(`/api/courses/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div>
      <h1 className="page-title">Courses</h1>
      {user.role === 'admin' && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-title">Add course</div>
          <div className="form-row">
            <div className="form-group">
              <label>Course code</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. CS 301" />
            </div>
            <div className="form-group">
              <label>Course name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Algorithms" />
            </div>
          </div>
          <div className="form-group">
            <label>Assign lecturer</label>
            <select value={form.lecturerId} onChange={e => {
              const u = users.find(x => x.id === e.target.value);
              setForm(f => ({ ...f, lecturerId: e.target.value, lecturer: u?.name || '' }));
            }}>
              {users.length === 0 && <option value="">No lecturers yet — add users first</option>}
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          {msg && <p style={{ fontSize: 13, color: '#2563eb', marginBottom: 10 }}>{msg}</p>}
          <button className="btn btn-primary" onClick={add}>Add course</button>
        </div>
      )}
      <div className="card">
        <div className="card-title">
          {user.role === 'admin' ? `All courses (${courses.length})` : 'Your courses'}
        </div>
        {courses.length === 0
          ? <p style={{ fontSize: 14, color: '#888' }}>No courses yet.</p>
          : (
            <table>
              <thead><tr><th>Code</th><th>Name</th><th>Lecturer</th><th>Added</th>{user.role === 'admin' && <th></th>}</tr></thead>
              <tbody>
                {courses.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.code}</strong></td>
                    <td>{c.name}</td>
                    <td>{c.lecturer || '—'}</td>
                    <td style={{ fontSize: 12, color: '#888' }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                    {user.role === 'admin' && <td><button className="btn btn-danger btn-sm" onClick={() => remove(c.id)}>Remove</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
