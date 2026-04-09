import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../AuthContext';

const SESSION_KEY = 'active_session';

function readStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

export default function Session() {
  const { authFetch } = useAuth();
  const [courses, setCourses] = useState([]);
  const [session, setSession] = useState(() => readStoredSession());
  const [attendance, setAttendance] = useState([]);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState({ courseId: '', windowMinutes: 10, lateThresholdMinutes: 5 });
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('qr');
  const [manualMarks, setManualMarks] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [activeAction, setActiveAction] = useState('');
  const timerRef = useRef(null);
  const pollRef = useRef(null);
  const qrRefreshRef = useRef(null);
  const displayWindowRef = useRef(null);

  const clearLiveIntervals = useCallback(() => {
    clearInterval(pollRef.current);
    clearInterval(timerRef.current);
    clearInterval(qrRefreshRef.current);
  }, []);

  const loadStudentsForCourse = useCallback(async (courseId) => {
    if (!courseId) {
      setStudents([]);
      setManualMarks({});
      return;
    }

    try {
      const res = await authFetch('/api/students');
      if (!res.ok) return;

      const all = await res.json();
      const enrolled = all.filter(s => s.courseId === courseId);
      setStudents(enrolled);

      const marks = {};
      enrolled.forEach(s => { marks[s.studentId] = 'absent'; });
      setManualMarks(marks);
    } catch {
      // Keep the last-known roster if this fetch fails briefly.
    }
  }, [authFetch]);

  const loadAttendance = useCallback(async (sessionId) => {
    if (!sessionId) {
      setAttendance([]);
      return;
    }

    try {
      const res = await authFetch(`/api/attendance?sessionId=${sessionId}`);
      if (!res.ok) return;
      setAttendance(await res.json());
    } catch {
      // Keep the current attendance list if polling fails.
    }
  }, [authFetch]);

  const syncLiveSession = useCallback(async (sessionId) => {
    if (!sessionId) return;

    try {
      const res = await authFetch('/api/sessions');
      if (!res.ok) return;

      const sessions = await res.json();
      const nextSession = sessions.find(item => item.id === sessionId);

      if (!nextSession) {
        setSession(current => current ? { ...current, active: false } : null);
        localStorage.removeItem(SESSION_KEY);
        return;
      }

      setSession(nextSession);
    } catch {
      const stored = readStoredSession();
      if (stored?.id === sessionId) setSession(stored);
    }

    await loadAttendance(sessionId);
  }, [authFetch, loadAttendance]);

  useEffect(() => {
    authFetch('/api/courses')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setCourses(data);
        if (data.length > 0) setForm(f => ({ ...f, courseId: f.courseId || data[0].id }));
      });
  }, [authFetch]);

  useEffect(() => {
    if (!session?.courseId) {
      setStudents([]);
      setManualMarks({});
      return;
    }

    if (!session.active || new Date() > new Date(session.expiresAt)) {
      setTimeLeft(0);
      return;
    }

    setTimeLeft(Math.max(0, Math.round((new Date(session.expiresAt) - Date.now()) / 1000)));
    loadStudentsForCourse(session.courseId);
    loadAttendance(session.id);
  }, [loadAttendance, loadStudentsForCourse, session?.active, session?.courseId, session?.expiresAt, session?.id]);

  useEffect(() => {
    if (session?.active && new Date() <= new Date(session.expiresAt)) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return;
    }

    localStorage.removeItem(SESSION_KEY);
  }, [session]);

  useEffect(() => {
    if (!session?.id || !session.active) return undefined;

    loadAttendance(session.id);
    pollRef.current = setInterval(() => {
      loadAttendance(session.id);
    }, 3000);

    return () => clearInterval(pollRef.current);
  }, [loadAttendance, session?.active, session?.id]);

  useEffect(() => {
    if (!session?.id || !session.active) return undefined;

    const expires = new Date(session.expiresAt).getTime();
    const tick = () => {
      const left = Math.max(0, Math.round((expires - Date.now()) / 1000));
      setTimeLeft(left);

      if (left === 0) {
        clearLiveIntervals();
        setSession(current => current ? { ...current, active: false } : null);
        localStorage.removeItem(SESSION_KEY);
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [clearLiveIntervals, session?.active, session?.expiresAt, session?.id]);

  useEffect(() => {
    if (!session?.id) return undefined;

    const resync = () => {
      const stored = readStoredSession();
      if (stored?.id === session.id) setSession(stored);
      syncLiveSession(session.id);
    };
    const onVisibilityChange = () => {
      if (!document.hidden) resync();
    };

    window.addEventListener('focus', resync);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', resync);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [session?.id, syncLiveSession]);

  const refreshQR = useCallback(async () => {
    if (!session?.id) return;

    setActiveAction('refresh');
    setSessionError('');

    try {
      const res = await authFetch(`/api/sessions/${session.id}/refresh-qr`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not refresh the QR code.');

      setSession(current => {
        if (!current) return current;
        const updated = { ...current, sessionCode: data.sessionCode, qrDataUrl: data.qrDataUrl, scanUrl: data.scanUrl };
        localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
        return updated;
      });
    } catch (error) {
      setSessionError(error.message || 'Could not refresh the QR code.');
      await syncLiveSession(session.id);
    } finally {
      setActiveAction('');
    }
  }, [authFetch, session?.id, syncLiveSession]);

  useEffect(() => {
    if (!session?.id || !session.active || mode !== 'qr') return undefined;

    qrRefreshRef.current = setInterval(() => {
      refreshQR();
    }, 30000);

    return () => clearInterval(qrRefreshRef.current);
  }, [mode, refreshQR, session?.active, session?.id]);

  const openDisplayWindow = () => {
    setSessionError('');

    const displayUrl = `${window.location.origin}/session-display`;
    let popup = displayWindowRef.current;

    if (!popup || popup.closed) {
      popup = window.open('', 'attendance-session-display', 'width=1200,height=900');
    }

    if (!popup) {
      setSessionError('The browser blocked the display window. Allow pop-ups for this site and try again.');
      return;
    }

    popup.location.href = displayUrl;
    popup.focus?.();
    displayWindowRef.current = popup;
  };

  const startSession = async () => {
    if (!form.courseId) {
      setSessionError('Select a course first.');
      return;
    }

    setLoading(true);
    setSessionError('');
    setSaveMsg('');
    clearLiveIntervals();

    try {
      const res = await authFetch('/api/sessions/start', { method: 'POST', body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start the session.');

      setSession(data);
      setTimeLeft(Math.max(0, Math.round((new Date(data.expiresAt) - Date.now()) / 1000)));
      setAttendance([]);
      setMode('qr');
      localStorage.setItem(SESSION_KEY, JSON.stringify(data));
      await loadStudentsForCourse(data.courseId);
      await loadAttendance(data.id);
    } catch (error) {
      setSessionError(error.message || 'Could not start the session.');
    } finally {
      setLoading(false);
    }
  };

  const closeSession = async () => {
    if (!session?.id) return;

    setActiveAction('close');
    setSessionError('');

    try {
      const res = await authFetch(`/api/sessions/${session.id}/close`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not close the session.');

      clearLiveIntervals();
      setSession(current => current ? { ...current, active: false } : null);
      setTimeLeft(0);
      localStorage.removeItem(SESSION_KEY);
    } catch (error) {
      setSessionError(error.message || 'Could not close the session.');
      await syncLiveSession(session.id);
    } finally {
      setActiveAction('');
    }
  };

  const switchToManual = () => {
    clearInterval(qrRefreshRef.current);
    setSessionError('');
    setMode('manual');

    const marks = {};
    students.forEach(s => { marks[s.studentId] = 'absent'; });
    attendance.forEach(a => { marks[a.studentId] = a.status; });
    setManualMarks(marks);
  };

  const saveManual = async () => {
    if (!session?.id) return;

    setSaving(true);
    setSaveMsg('');
    setSessionError('');

    try {
      const records = Object.entries(manualMarks).map(([studentId, status]) => ({ studentId, status }));
      const res = await authFetch(`/api/sessions/${session.id}/manual-attendance`, {
        method: 'POST',
        body: JSON.stringify({ records }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save manual attendance.');

      setSaveMsg(`Saved - ${data.added?.length || 0} recorded, ${data.skipped?.length || 0} skipped.`);
      await loadAttendance(session.id);
    } catch (error) {
      setSessionError(error.message || 'Could not save manual attendance.');
    } finally {
      setSaving(false);
    }
  };

  const resetSessionView = () => {
    clearLiveIntervals();
    setSession(null);
    setAttendance([]);
    setStudents([]);
    setManualMarks({});
    setMode('qr');
    setTimeLeft(0);
    setSaveMsg('');
    setSessionError('');
    localStorage.removeItem(SESSION_KEY);
  };

  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const pct = session ? Math.round((timeLeft / (session.windowMinutes * 60)) * 100) : 0;
  const isExpired = session && (!session.active || new Date() > new Date(session.expiresAt));
  const statusColor = { present: '#166534', late: '#854d0e', absent: '#888' };
  const statusBg = { present: '#dcfce7', late: '#fef9c3', absent: '#f5f5f5' };

  return (
    <div>
      <h1 className="page-title">Start session</h1>

      {!session ? (
        <div className="card" style={{ maxWidth: 480 }}>
          <div className="card-title">Session settings</div>
          {sessionError && (
            <p className="session-inline-error">{sessionError}</p>
          )}
          <div className="form-group">
            <label>Course</label>
            <select value={form.courseId} onChange={e => setForm(f => ({ ...f, courseId: e.target.value }))}>
              {courses.length === 0 && <option value="">No courses yet - add one first</option>}
              {courses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Scan window (minutes)</label>
              <select value={form.windowMinutes} onChange={e => setForm(f => ({ ...f, windowMinutes: +e.target.value }))}>
                {[5, 10, 15, 20, 30].map(v => <option key={v} value={v}>{v} min</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Late threshold (minutes)</label>
              <select value={form.lateThresholdMinutes} onChange={e => setForm(f => ({ ...f, lateThresholdMinutes: +e.target.value }))}>
                {[3, 5, 10, 15].map(v => <option key={v} value={v}>{v} min</option>)}
              </select>
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={startSession} disabled={loading}>
            {loading ? 'Generating...' : 'Generate QR code'}
          </button>
        </div>
      ) : (
        <div>
          {!isExpired && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn"
                onClick={() => { setMode('qr'); setSessionError(''); }}
                style={{ background: mode === 'qr' ? '#dbeafe' : undefined, borderColor: mode === 'qr' ? '#93c5fd' : undefined, color: mode === 'qr' ? '#1e40af' : undefined, fontWeight: mode === 'qr' ? 600 : undefined }}>
                QR Mode
              </button>
              <button
                type="button"
                className="btn"
                onClick={switchToManual}
                style={{ background: mode === 'manual' ? '#fef9c3' : undefined, borderColor: mode === 'manual' ? '#fde047' : undefined, color: mode === 'manual' ? '#854d0e' : undefined, fontWeight: mode === 'manual' ? 600 : undefined }}>
                Manual Mode (WiFi backup)
              </button>
              {mode === 'manual' && (
                <span style={{ fontSize: 13, color: '#854d0e', background: '#fef9c3', padding: '4px 10px', borderRadius: 6, border: '1px solid #fde047' }}>
                  WiFi dropped? Mark attendance manually below
                </span>
              )}
            </div>
          )}

          {sessionError && (
            <p className="session-inline-error" style={{ marginBottom: 16 }}>
              {sessionError}
            </p>
          )}

          <div className="session-live-grid">
            <div className="card session-live-card">
              {mode === 'qr' ? (
                <>
                  <div className="card-title">QR code - {session.courseCode}</div>
                  <div className="qr-container">
                    <img src={session.qrDataUrl} alt="QR Code" style={{ imageRendering: 'pixelated' }} />
                    <div className="session-code">{session.sessionCode}</div>
                    {!isExpired ? (
                      <>
                        <div className="timer">Closes in <span>{fmt(timeLeft)}</span></div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <p style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>QR refreshes automatically every 30s</p>
                        <p style={{ fontSize: 11, color: '#888', marginTop: -6, textAlign: 'center', maxWidth: 260 }}>
                          Open the display window for a larger projector-friendly QR view.
                        </p>
                      </>
                    ) : (
                      <div style={{ color: '#b91c1c', fontWeight: 600, fontSize: 14 }}>Session closed</div>
                    )}
                    <div className="session-action-row">
                      {!isExpired && (
                        <>
                          <button type="button" className="btn btn-sm" onClick={openDisplayWindow} disabled={activeAction === 'close'}>
                            Open display window
                          </button>
                          <button type="button" className="btn btn-primary btn-sm" onClick={refreshQR} disabled={activeAction === 'refresh' || activeAction === 'close'}>
                            {activeAction === 'refresh' ? 'Refreshing...' : 'Refresh now'}
                          </button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={closeSession} disabled={activeAction === 'close'}>
                            {activeAction === 'close' ? 'Closing...' : 'Close session'}
                          </button>
                        </>
                      )}
                      {isExpired && (
                        <button type="button" className="btn btn-primary" onClick={resetSessionView}>
                          Start new session
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="card-title" style={{ color: '#854d0e' }}>Manual attendance - {session.courseCode}</div>
                  <p style={{ fontSize: 13, color: '#888', marginBottom: 14 }}>
                    Tick each student's status. Students already scanned are pre-filled.
                  </p>
                  {students.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#aaa' }}>No students enrolled in this course yet.</p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <button type="button" className="btn btn-sm" onClick={() => { const nextMarks = {}; students.forEach(s => { nextMarks[s.studentId] = 'present'; }); setManualMarks(nextMarks); }}>All present</button>
                        <button type="button" className="btn btn-sm" onClick={() => { const nextMarks = {}; students.forEach(s => { nextMarks[s.studentId] = 'absent'; }); setManualMarks(nextMarks); }}>Clear all</button>
                      </div>
                      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                        {students.map(s => (
                          <div key={s.studentId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                            <div>
                              <p style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</p>
                              <p style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>{s.studentId}</p>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {['present', 'late', 'absent'].map(status => (
                                <button
                                  type="button"
                                  key={status}
                                  onClick={() => setManualMarks(current => ({ ...current, [s.studentId]: status }))}
                                  style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontWeight: manualMarks[s.studentId] === status ? 600 : 400, background: manualMarks[s.studentId] === status ? statusBg[status] : '#f5f5f5', color: manualMarks[s.studentId] === status ? statusColor[status] : '#888', border: `1px solid ${manualMarks[s.studentId] === status ? statusColor[status] : '#e5e5e5'}` }}>
                                  {status}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-primary" onClick={saveManual} disabled={saving}>
                          {saving ? 'Saving...' : 'Save attendance'}
                        </button>
                        {saveMsg && <span style={{ fontSize: 13, color: '#166534' }}>{saveMsg}</span>}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="card session-live-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
                <div className="card-title" style={{ margin: 0 }}>Attendance ({attendance.length})</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!isExpired && <span style={{ fontSize: 12, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>Live</span>}
                  {attendance.some(a => a.manual) && <span style={{ fontSize: 12, background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>Manual entries</span>}
                </div>
              </div>
              {attendance.length === 0 ? (
                <p style={{ fontSize: 14, color: '#888' }}>{isExpired ? 'Session ended.' : 'Waiting for scans...'}</p>
              ) : (
                <div style={{ maxHeight: 400, overflowY: 'auto', minWidth: 0 }}>
                  <table>
                    <thead><tr><th>Student</th><th>Time</th><th>Status</th></tr></thead>
                    <tbody>
                      {attendance.map(a => (
                        <tr key={a.id}>
                          <td>
                            {a.studentName}
                            {a.manual && <span style={{ fontSize: 11, color: '#854d0e', marginLeft: 6 }}>manual</span>}
                          </td>
                          <td>{new Date(a.scannedAt).toLocaleTimeString()}</td>
                          <td><span className={`badge badge-${a.status}`}>{a.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
