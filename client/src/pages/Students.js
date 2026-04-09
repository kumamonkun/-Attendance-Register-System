import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';

export default function Students() {
  const { authFetch, user } = useAuth();
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState({ name: '', studentId: '', email: '', courseId: '' });
  const [filterCourse, setFilterCourse] = useState('all');
  const [msg, setMsg] = useState('');
  const isAdmin = user?.role === 'admin';

  const load = () => {
    authFetch('/api/students').then(r => r.json()).then(setStudents);
    authFetch('/api/courses').then(r => r.json()).then(c => {
      setCourses(c);
      if (c.length > 0) setForm(f => ({ ...f, courseId: f.courseId || c[0].id }));
    });
  };

  useEffect(load, []);

  const add = async () => {
    if (!form.name || !form.studentId || !form.courseId) return setMsg('Name, ID and course are required.');
    const res = await authFetch('/api/students', { method: 'POST', body: JSON.stringify(form) });
    if (res.ok) {
      setMsg('Student added.');
      setForm(f => ({ ...f, name: '', studentId: '', email: '' }));
      load();
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this student?')) return;
    await authFetch(`/api/students/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = filterCourse === 'all' ? students : students.filter(s => s.courseId === filterCourse);
  const courseName = id => courses.find(c => c.id === id)?.code || '-';

  return (
    <div>
      <h1 className="page-title">Students</h1>

      {isAdmin && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-title">Add student</div>
          <div className="form-row">
            <div className="form-group">
              <label>Full name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Amalia Nghifikepunye" />
            </div>
            <div className="form-group">
              <label>Student ID</label>
              <input value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))} placeholder="e.g. STU-2024-001" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Email <span style={{ color: '#aaa', fontWeight: 400 }}>(for alerts)</span></label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="student@university.edu" />
            </div>
            <div className="form-group">
              <label>Course</label>
              <select value={form.courseId} onChange={e => setForm(f => ({ ...f, courseId: e.target.value }))}>
                {courses.length === 0 && <option value="">No courses yet</option>}
                {courses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
              </select>
            </div>
          </div>
          {msg && <p style={{ fontSize: 13, color: '#2563eb', marginBottom: 10 }}>{msg}</p>}
          <button className="btn btn-primary" onClick={add}>Add student</button>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="card-title" style={{ margin: 0 }}>Roster ({filtered.length})</div>
          <select
            value={filterCourse}
            onChange={e => setFilterCourse(e.target.value)}
            style={{ width: 'auto', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13 }}>
            <option value="all">All courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
        </div>
        {filtered.length === 0 ? (
          <p style={{ fontSize: 14, color: '#888' }}>No students yet.</p>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Student ID</th><th>Email</th><th>Course</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{s.studentId}</td>
                  <td style={{ fontSize: 13, color: s.email ? '#555' : '#ccc' }}>{s.email || 'no email'}</td>
                  <td><span className="badge badge-active">{courseName(s.courseId)}</span></td>
                  {isAdmin && <td><button className="btn btn-danger btn-sm" onClick={() => remove(s.id)}>Remove</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
