import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';

function Bar({ label, value, max, color, displayValue }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: '#555' }}>{label}</span>
        <span style={{ fontWeight: 600 }}>{displayValue ?? value}</span>
      </div>
      <div style={{ height: 8, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function DonutRing({ present, late, absent }) {
  const total = present + late + absent || 1;
  const r = 52;
  const cx = 64;
  const cy = 64;
  const stroke = 14;
  const circ = 2 * Math.PI * r;
  const pPct = present / total;
  const lPct = late / total;
  const aPct = absent / total;
  const pDash = pPct * circ;
  const lDash = lPct * circ;
  const aDash = aPct * circ;

  return (
    <svg width="128" height="128" viewBox="0 0 128 128">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f0f0" strokeWidth={stroke} />
      {present > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#22c55e" strokeWidth={stroke} strokeDasharray={`${pDash} ${circ - pDash}`} strokeDashoffset={0} transform="rotate(-90 64 64)" />}
      {late > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f59e0b" strokeWidth={stroke} strokeDasharray={`${lDash} ${circ - lDash}`} strokeDashoffset={-pDash} transform="rotate(-90 64 64)" />}
      {absent > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ef4444" strokeWidth={stroke} strokeDasharray={`${aDash} ${circ - aDash}`} strokeDashoffset={-(pDash + lDash)} transform="rotate(-90 64 64)" />}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="18" fontWeight="700" fill="#1a1a1a">
        {Math.round(((present + late) / total) * 100)}%
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="11" fill="#888">
        attended
      </text>
    </svg>
  );
}

export default function Dashboard() {
  const { authFetch } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);

  useEffect(() => {
    Promise.all([
      authFetch('/api/sessions').then(r => r.json()),
      authFetch('/api/attendance').then(r => r.json()),
      authFetch('/api/courses').then(r => r.json()),
      authFetch('/api/students').then(r => r.json()),
    ]).then(([s, a, c, st]) => {
      setSessions(s);
      setAttendance(a);
      setCourses(c);
      setStudents(st);
    });
  }, [authFetch]);

  const today = new Date().toDateString();
  const todaySessions = sessions.filter(s => new Date(s.startedAt).toDateString() === today);
  const todayAtt = attendance.filter(a => todaySessions.some(s => s.id === a.sessionId));
  const totalPresent = attendance.filter(a => a.status === 'present').length;
  const totalLate = attendance.filter(a => a.status === 'late').length;
  const totalScans = attendance.length;
  const totalAbsent = Math.max(0, sessions.length * students.length - totalScans);

  const courseStats = courses.map(c => {
    const courseSessions = sessions.filter(s => s.courseId === c.id);
    const courseAtt = attendance.filter(a => a.courseId === c.id);
    const enrolled = students.filter(s => s.courseId === c.id).length;
    const rate = courseSessions.length > 0 && enrolled > 0
      ? Math.round((courseAtt.length / (courseSessions.length * enrolled)) * 100)
      : 0;

    return { ...c, sessions: courseSessions.length, scans: courseAtt.length, enrolled, rate };
  }).sort((a, b) => b.rate - a.rate);

  const last7 = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      label: d.toLocaleDateString('en', { weekday: 'short' }),
      count: attendance.filter(a => new Date(a.scannedAt).toDateString() === d.toDateString()).length,
    };
  });
  const maxScans = Math.max(...last7.map(d => d.count), 1);

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>

      <div className="metrics">
        <div className="metric"><div className="metric-label">Sessions today</div><div className="metric-value">{todaySessions.length}</div></div>
        <div className="metric"><div className="metric-label">Scans today</div><div className="metric-value">{todayAtt.length}</div></div>
        <div className="metric"><div className="metric-label">Total students</div><div className="metric-value">{students.length}</div></div>
        <div className="metric"><div className="metric-label">Total courses</div><div className="metric-value">{courses.length}</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">Overall attendance breakdown</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <DonutRing present={totalPresent} late={totalLate} absent={totalAbsent} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: '#22c55e' }} />
                <span style={{ fontSize: 13 }}>Present - {totalPresent}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: '#f59e0b' }} />
                <span style={{ fontSize: 13 }}>Late - {totalLate}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: '#ef4444' }} />
                <span style={{ fontSize: 13 }}>Absent - {totalAbsent}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Scans - last 7 days</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80, marginBottom: 8 }}>
            {last7.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', background: d.count > 0 ? '#2563eb' : '#e5e5e5', borderRadius: '3px 3px 0 0', height: Math.max(4, (d.count / maxScans) * 64), transition: 'height 0.5s ease' }} />
                <span style={{ fontSize: 11, color: '#888' }}>{d.label}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: '#aaa', textAlign: 'right' }}>Total: {last7.reduce((sum, d) => sum + d.count, 0)} scans</p>
        </div>
      </div>

      {courseStats.length > 0 && (
        <div className="card">
          <div className="card-title">Attendance rate by course</div>
          {courseStats.map(c => (
            <Bar
              key={c.id}
              label={`${c.code} - ${c.name} (${c.enrolled} students, ${c.sessions} sessions)`}
              value={c.rate}
              displayValue={`${c.rate}%`}
              max={100}
              color={c.rate >= 75 ? '#22c55e' : c.rate >= 50 ? '#f59e0b' : '#ef4444'}
            />
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-title">Today's sessions</div>
        {todaySessions.length === 0 ? (
          <p style={{ fontSize: 14, color: '#888' }}>No sessions today yet.</p>
        ) : (
          <table>
            <thead><tr><th>Course</th><th>Started</th><th>Window</th><th>Status</th><th>Scans</th></tr></thead>
            <tbody>
              {todaySessions.map(s => {
                const scans = attendance.filter(a => a.sessionId === s.id).length;
                const closed = !s.active || new Date() > new Date(s.expiresAt);

                return (
                  <tr key={s.id}>
                    <td><strong>{s.courseCode}</strong> - {s.courseName}</td>
                    <td>{new Date(s.startedAt).toLocaleTimeString()}</td>
                    <td>{s.windowMinutes} min</td>
                    <td><span className={`badge ${closed ? '' : 'badge-active'}`}>{closed ? 'Closed' : 'Live'}</span></td>
                    <td>{scans}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
