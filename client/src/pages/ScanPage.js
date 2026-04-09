import { useState } from 'react';
import { useParams } from 'react-router-dom';

export default function ScanPage() {
  const { sessionId, sessionCode } = useParams();
  const [studentId, setStudentId] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [studentName, setStudentName] = useState('');

  const submit = async () => {
    if (!studentId.trim()) return;

    setStatus('loading');
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, sessionCode, studentId: studentId.trim() }),
    });
    const data = await res.json();

    if (res.ok) {
      setStatus('success');
      setStudentName(data.studentName);
      setMessage(data.status === 'late' ? 'Marked as late' : 'Marked as present');
      return;
    }

    setStatus('error');
    setMessage(data.error || 'Something went wrong.');
  };

  return (
    <div className="scan-page">
      <div className="scan-card">
        {status === 'idle' || status === 'loading' ? (
          <>
            <h2>Mark attendance</h2>
            <p>Enter your student ID to register your attendance for this session.</p>
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label>Student ID</label>
              <input
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="e.g. STU-2024-001"
                autoFocus
              />
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={submit} disabled={status === 'loading'}>
              {status === 'loading' ? 'Checking...' : 'Submit'}
            </button>
          </>
        ) : status === 'success' ? (
          <>
            <div className="success-icon">OK</div>
            <h2>You're in!</h2>
            <p style={{ fontWeight: 600, fontSize: 16, color: '#1a1a1a', marginBottom: 6 }}>{studentName}</p>
            <p>{message}</p>
          </>
        ) : (
          <>
            <div className="success-icon">NO</div>
            <h2>Not recorded</h2>
            <p style={{ color: '#b91c1c' }}>{message}</p>
            <button className="btn" style={{ marginTop: 16 }} onClick={() => { setStatus('idle'); setMessage(''); }}>
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
