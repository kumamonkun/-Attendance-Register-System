import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';

async function readJson(response) {
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') ? response.json() : {};
}

export default function Courses() {
  const { authFetch, user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ code: '', name: '', lecturer: '', lecturerId: '' });
  const [editForm, setEditForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const isAdmin = user?.role === 'admin';

  const load = useCallback(async () => {
    const courseRequest = authFetch('/api/courses');
    const userRequest = isAdmin ? authFetch('/api/users') : Promise.resolve(null);
    const [coursesRes, usersRes] = await Promise.all([courseRequest, userRequest]);

    const nextCourses = coursesRes?.ok ? await readJson(coursesRes) : [];
    setCourses(Array.isArray(nextCourses) ? nextCourses : []);

    if (isAdmin && usersRes?.ok) {
      const allUsers = await readJson(usersRes);
      const lecturers = Array.isArray(allUsers) ? allUsers.filter((entry) => entry.role === 'lecturer') : [];
      setUsers(lecturers);

      if (lecturers.length > 0) {
        setForm((current) => ({
          ...current,
          lecturerId: current.lecturerId || lecturers[0].id,
          lecturer: current.lecturer || lecturers[0].name,
        }));
        setEditForm((current) => {
          if (!current) return current;
          if (!current.lecturerId) return current;
          const match = lecturers.find((entry) => entry.id === current.lecturerId);
          return match ? { ...current, lecturer: match.name } : { ...current, lecturerId: '', lecturer: '' };
        });
      }
    }
  }, [authFetch, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const syncLecturerSelection = (lecturerId) => {
    const selected = users.find((entry) => entry.id === lecturerId);
    return { lecturerId, lecturer: selected?.name || '' };
  };

  const add = async () => {
    setMsg('');
    setError('');

    if (!form.code || !form.name) {
      setError('Course code and name are required.');
      return;
    }

    const res = await authFetch('/api/courses', { method: 'POST', body: JSON.stringify(form) });
    const data = await readJson(res);
    if (!res.ok) {
      setError(data.error || 'Could not add the course.');
      return;
    }

    setMsg(`Course added for ${data.code}.`);
    setForm((current) => ({ ...current, code: '', name: '' }));
    await load();
  };

  const startEdit = (course) => {
    setMsg('');
    setError('');
    setEditForm({
      id: course.id,
      code: course.code,
      name: course.name,
      lecturerId: course.lecturerId || '',
      lecturer: course.lecturer || '',
    });
  };

  const saveEdit = async () => {
    if (!editForm) return;

    setMsg('');
    setError('');

    if (!editForm.code || !editForm.name) {
      setError('Course code and name are required.');
      return;
    }

    const res = await authFetch(`/api/courses/${editForm.id}`, {
      method: 'PUT',
      body: JSON.stringify(editForm),
    });
    const data = await readJson(res);
    if (!res.ok) {
      setError(data.error || 'Could not update the course.');
      return;
    }

    setMsg(`Course details updated for ${data.code}.`);
    setEditForm(null);
    await load();
  };

  const remove = async (id) => {
    setMsg('');
    setError('');

    if (!window.confirm('Remove this course?')) return;
    const res = await authFetch(`/api/courses/${id}`, { method: 'DELETE' });
    const data = await readJson(res);
    if (!res.ok) {
      setError(data.error || 'Could not remove the course.');
      return;
    }

    if (editForm?.id === id) setEditForm(null);
    setMsg('Course removed.');
    await load();
  };

  return (
    <div>
      <h1 className="page-title">Courses</h1>

      {isAdmin && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-title">Add course</div>
          <div className="form-row">
            <div className="form-group">
              <label>Course code</label>
              <input value={form.code} onChange={e => setForm(current => ({ ...current, code: e.target.value }))} placeholder="e.g. CS 301" />
            </div>
            <div className="form-group">
              <label>Course name</label>
              <input value={form.name} onChange={e => setForm(current => ({ ...current, name: e.target.value }))} placeholder="e.g. Algorithms" />
            </div>
          </div>
          <div className="form-group">
            <label>Assign lecturer</label>
            <select
              value={form.lecturerId}
              onChange={e => setForm(current => ({ ...current, ...syncLecturerSelection(e.target.value) }))}>
              <option value="">Unassigned</option>
              {users.length === 0 && <option value="">No lecturers yet - add users first</option>}
              {users.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </div>
          {error && <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 10 }}>{error}</p>}
          {msg && <p style={{ fontSize: 13, color: '#166534', marginBottom: 10 }}>{msg}</p>}
          <button className="btn btn-primary" onClick={add}>Add course</button>
        </div>
      )}

      {isAdmin && editForm && (
        <div className="card" style={{ maxWidth: 560, border: '1px solid #bfdbfe', background: '#f8fbff' }}>
          <div className="card-title">Edit course</div>
          <div className="form-row">
            <div className="form-group">
              <label>Course code</label>
              <input value={editForm.code} onChange={e => setEditForm(current => ({ ...current, code: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Course name</label>
              <input value={editForm.name} onChange={e => setEditForm(current => ({ ...current, name: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Assign lecturer</label>
            <select
              value={editForm.lecturerId}
              onChange={e => setEditForm(current => ({ ...current, ...syncLecturerSelection(e.target.value) }))}>
              <option value="">Unassigned</option>
              {users.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={saveEdit}>Save changes</button>
            <button className="btn" onClick={() => setEditForm(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          {isAdmin ? `All courses (${courses.length})` : 'Your courses'}
        </div>
        {courses.length === 0
          ? <p style={{ fontSize: 14, color: '#888' }}>No courses yet.</p>
          : (
            <table>
              <thead><tr><th>Code</th><th>Name</th><th>Lecturer</th><th>Added</th>{isAdmin && <th></th>}</tr></thead>
              <tbody>
                {courses.map(course => (
                  <tr key={course.id}>
                    <td><strong>{course.code}</strong></td>
                    <td>{course.name}</td>
                    <td>{course.lecturer || '-'}</td>
                    <td style={{ fontSize: 12, color: '#888' }}>{new Date(course.createdAt).toLocaleDateString()}</td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button className="btn btn-sm" onClick={() => startEdit(course)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => remove(course.id)}>Remove</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
