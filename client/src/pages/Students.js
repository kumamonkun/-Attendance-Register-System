import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';

async function readJson(response) {
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') ? response.json() : {};
}

export default function Students() {
  const { authFetch, user } = useAuth();
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState({ name: '', studentId: '', email: '', courseId: '' });
  const [editForm, setEditForm] = useState(null);
  const [filterCourse, setFilterCourse] = useState('all');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const isAdmin = user?.role === 'admin';

  const load = useCallback(async () => {
    const [studentsRes, coursesRes] = await Promise.all([
      authFetch('/api/students'),
      authFetch('/api/courses'),
    ]);

    const nextStudents = studentsRes.ok ? await readJson(studentsRes) : [];
    const nextCourses = coursesRes.ok ? await readJson(coursesRes) : [];

    setStudents(Array.isArray(nextStudents) ? nextStudents : []);
    setCourses(Array.isArray(nextCourses) ? nextCourses : []);

    if (nextCourses.length > 0) {
      setForm((current) => ({ ...current, courseId: current.courseId || nextCourses[0].id }));
      setEditForm((current) => {
        if (!current) return current;
        const stillExists = nextCourses.some((course) => course.id === current.courseId);
        return stillExists ? current : { ...current, courseId: nextCourses[0].id };
      });
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    setMsg('');
    setError('');

    if (!form.name || !form.studentId || !form.courseId) {
      setError('Name, student ID, and course are required.');
      return;
    }

    const res = await authFetch('/api/students', { method: 'POST', body: JSON.stringify(form) });
    const data = await readJson(res);
    if (!res.ok) {
      setError(data.error || 'Could not add the student.');
      return;
    }

    setMsg(`Student added for ${data.name}.`);
    setForm((current) => ({ ...current, name: '', studentId: '', email: '' }));
    await load();
  };

  const startEdit = (student) => {
    setMsg('');
    setError('');
    setEditForm({
      id: student.id,
      name: student.name,
      studentId: student.studentId,
      email: student.email || '',
      courseId: student.courseId || (courses[0]?.id || ''),
    });
  };

  const saveEdit = async () => {
    if (!editForm) return;

    setMsg('');
    setError('');

    if (!editForm.name || !editForm.studentId || !editForm.courseId) {
      setError('Name, student ID, and course are required.');
      return;
    }

    const res = await authFetch(`/api/students/${editForm.id}`, {
      method: 'PUT',
      body: JSON.stringify(editForm),
    });
    const data = await readJson(res);
    if (!res.ok) {
      setError(data.error || 'Could not update the student.');
      return;
    }

    setMsg(`Student details updated for ${data.name}.`);
    setEditForm(null);
    await load();
  };

  const remove = async (id) => {
    setMsg('');
    setError('');

    if (!window.confirm('Remove this student?')) return;
    const res = await authFetch(`/api/students/${id}`, { method: 'DELETE' });
    const data = await readJson(res);
    if (!res.ok) {
      setError(data.error || 'Could not remove the student.');
      return;
    }

    if (editForm?.id === id) setEditForm(null);
    setMsg('Student removed.');
    await load();
  };

  const filtered = filterCourse === 'all' ? students : students.filter((student) => student.courseId === filterCourse);
  const courseName = (id) => courses.find((course) => course.id === id)?.code || '-';

  return (
    <div>
      <h1 className="page-title">Students</h1>

      {isAdmin && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-title">Add student</div>
          <div className="form-row">
            <div className="form-group">
              <label>Full name</label>
              <input value={form.name} onChange={e => setForm(current => ({ ...current, name: e.target.value }))} placeholder="e.g. Amalia Nghifikepunye" />
            </div>
            <div className="form-group">
              <label>Student ID</label>
              <input value={form.studentId} onChange={e => setForm(current => ({ ...current, studentId: e.target.value }))} placeholder="e.g. STU-2024-001" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Email <span style={{ color: '#aaa', fontWeight: 400 }}>(for alerts)</span></label>
              <input type="email" value={form.email} onChange={e => setForm(current => ({ ...current, email: e.target.value }))} placeholder="student@university.edu" />
            </div>
            <div className="form-group">
              <label>Course</label>
              <select value={form.courseId} onChange={e => setForm(current => ({ ...current, courseId: e.target.value }))}>
                {courses.length === 0 && <option value="">No courses yet</option>}
                {courses.map(course => <option key={course.id} value={course.id}>{course.code} - {course.name}</option>)}
              </select>
            </div>
          </div>
          {error && <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 10 }}>{error}</p>}
          {msg && <p style={{ fontSize: 13, color: '#166534', marginBottom: 10 }}>{msg}</p>}
          <button className="btn btn-primary" onClick={add}>Add student</button>
        </div>
      )}

      {isAdmin && editForm && (
        <div className="card" style={{ maxWidth: 560, border: '1px solid #bfdbfe', background: '#f8fbff' }}>
          <div className="card-title">Edit student</div>
          <div className="form-row">
            <div className="form-group">
              <label>Full name</label>
              <input value={editForm.name} onChange={e => setEditForm(current => ({ ...current, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Student ID</label>
              <input value={editForm.studentId} onChange={e => setEditForm(current => ({ ...current, studentId: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={editForm.email} onChange={e => setEditForm(current => ({ ...current, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Course</label>
              <select value={editForm.courseId} onChange={e => setEditForm(current => ({ ...current, courseId: e.target.value }))}>
                {courses.map(course => <option key={course.id} value={course.id}>{course.code} - {course.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={saveEdit}>Save changes</button>
            <button className="btn" onClick={() => setEditForm(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
          <div className="card-title" style={{ margin: 0 }}>Roster ({filtered.length})</div>
          <select
            value={filterCourse}
            onChange={e => setFilterCourse(e.target.value)}
            style={{ width: 'auto', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13 }}>
            <option value="all">All courses</option>
            {courses.map(course => <option key={course.id} value={course.id}>{course.code}</option>)}
          </select>
        </div>
        {filtered.length === 0 ? (
          <p style={{ fontSize: 14, color: '#888' }}>No students yet.</p>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Student ID</th><th>Email</th><th>Course</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>
              {filtered.map(student => (
                <tr key={student.id}>
                  <td>{student.name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{student.studentId}</td>
                  <td style={{ fontSize: 13, color: student.email ? '#555' : '#ccc' }}>{student.email || 'no email'}</td>
                  <td><span className="badge badge-active">{courseName(student.courseId)}</span></td>
                  {isAdmin && (
                    <td>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm" onClick={() => startEdit(student)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => remove(student.id)}>Remove</button>
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
