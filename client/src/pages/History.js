import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';

export default function History() {
  const { authFetch } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [courses, setCourses] = useState([]);
  const [filterCourse, setFilterCourse] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      authFetch('/api/sessions').then(r => r.json()),
      authFetch('/api/attendance').then(r => r.json()),
      authFetch('/api/courses').then(r => r.json()),
    ]).then(([s, a, c]) => {
      setSessions(s.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)));
      setAttendance(a);
      setCourses(c);
      setLoading(false);
    });
  }, []);

  const filtered = filterCourse === 'all' ? sessions : sessions.filter(s => s.courseId === filterCourse);

  const getScans = (sessionId) => attendance.filter(a => a.sessionId === sessionId);

  return (
    <div>
      <h1 className="page-title">Session history</h1>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <p style={{ fontSize: 14, color: '#888' }}>{filtered.length} session{filtered.length !== 1 ? 's' : ''}</p>
        <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14 }}>
          <option value="all">All courses</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
        </select>
      </div>

      {loading && <p style={{ color: '#888', fontSize: 14 }}>Loading...</p>}

      {!loading && filtered.length === 0 && (
        <p style={{ color: '#888', fontSize: 14 }}>No sessions yet. Start one from the Session page.</p>
      )}

      {filtered.map(s => {
        const scans = getScans(s.id);
        const present = scans.filter(a => a.status === 'present').length;
        const late = scans.filter(a => a.status === 'late').length;
        const isOpen = expanded === s.id;
        const closed = !s.active || new Date() > new Date(s.expiresAt);

        return (
          <div key={s.id} className="card" style={{ marginBottom: 10, padding: 0, overflow: 'hidden' }}>
            <div
              onClick={() => setExpanded(isOpen ? null : s.id)}
              style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>{s.courseCode} — {s.courseName}</p>
                  <p style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {new Date(s.startedAt).toLocaleDateString()} · {new Date(s.startedAt).toLocaleTimeString()} · {s.windowMinutes} min window
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: '#555' }}>
                  <strong style={{ color: '#166534' }}>{present}</strong> present · <strong style={{ color: '#854d0e' }}>{late}</strong> late
                </span>
                <span className={`badge ${closed ? '' : 'badge-active'}`} style={{ background: closed ? '#f1f0e8' : undefined }}>
                  {closed ? 'Closed' : 'Live'}
                </span>
                <span style={{ fontSize: 12, color: '#aaa' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid #f0f0f0', padding: '0 18px 14px' }}>
                {scans.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#aaa', paddingTop: 12 }}>No scans recorded for this session.</p>
                ) : (
                  <table style={{ marginTop: 10 }}>
                    <thead><tr><th>Student</th><th>Student ID</th><th>Status</th><th>Scanned at</th></tr></thead>
                    <tbody>
                      {scans.map(a => (
                        <tr key={a.id}>
                          <td>{a.studentName}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{a.studentId}</td>
                          <td><span className={`badge badge-${a.status}`}>{a.status}</span></td>
                          <td style={{ fontSize: 12, color: '#888' }}>{new Date(a.scannedAt).toLocaleTimeString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
