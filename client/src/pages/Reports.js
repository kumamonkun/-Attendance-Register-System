import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';

export default function Reports() {
  const { authFetch } = useAuth();
  const [courses, setCourses] = useState([]);
  const [selected, setSelected] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    authFetch('/api/courses')
      .then(r => r.json())
      .then(data => {
        setCourses(data);
        if (data.length > 0) setSelected(data[0].id);
      });
  }, [authFetch]);

  const generate = async () => {
    if (!selected) return;

    setLoading(true);
    setReport(null);
    setError('');

    try {
      const res = await authFetch(`/api/reports/course/${selected}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not generate the report.');

      setReport(data);
      setEmailSubject(`Attendance Warning - ${data.course.code}: ${data.course.name}`);
      setEmailBody(`Dear [Student Name],

This is an attendance warning for ${data.course.code} - ${data.course.name}.

Your current attendance rate is [Rate]%, which is below the required 75% minimum.

Sessions present: [Present] | Late: [Late] | Absent: [Absent]

Please attend all upcoming sessions to avoid academic penalties.
If you have concerns, contact your lecturer directly.

Regards,
${data.course.lecturer || 'Course Lecturer'}`);
    } catch (reportError) {
      setError(reportError.message || 'Could not generate the report.');
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = async () => {
    if (!selected) return;

    setExporting(true);
    setError('');

    try {
      const res = await authFetch(`/api/export/course/${selected}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Could not export the Excel file.');
      }

      const blob = await res.blob();
      const course = courses.find(c => c.id === selected);
      const filename = `${course?.code?.replace(/\s+/g, '_') || 'attendance'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError.message || 'Could not export the Excel file.');
    } finally {
      setExporting(false);
    }
  };

  const openEmail = (student) => {
    const subject = encodeURIComponent(emailSubject);
    const body = encodeURIComponent(
      emailBody
        .replace('[Student Name]', student.name)
        .replace('[Rate]', student.rate)
        .replace('[Present]', student.present)
        .replace('[Late]', student.late)
        .replace('[Absent]', student.absent)
    );
    const to = student.email ? encodeURIComponent(student.email) : '';
    window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_blank');
  };

  const atRisk = report?.report.filter(s => s.rate < 75) || [];
  const openAllEmails = () => {
    atRisk.forEach((student, index) => setTimeout(() => openEmail(student), index * 300));
  };

  return (
    <div>
      <h1 className="page-title">Reports</h1>

      {showEmailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 540, maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Email template</h2>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 18 }}>
              Clicking send opens your email client for each student. Edit the template below first.
            </p>
            <div className="form-group">
              <label>Subject</label>
              <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Body - use <code>[Student Name]</code>, <code>[Rate]</code>, <code>[Present]</code>, <code>[Late]</code>, <code>[Absent]</code></label>
              <textarea
                value={emailBody}
                onChange={e => setEmailBody(e.target.value)}
                style={{ width: '100%', height: 200, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Recipients ({atRisk.length}):</p>
              {atRisk.map(s => (
                <div key={s.studentId} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #e5e5e5' }}>
                  <span>{s.name}</span>
                  <span style={{ color: s.email ? '#555' : '#f87171' }}>{s.email || 'no email - will open blank'}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => { openAllEmails(); setShowEmailModal(false); }}>
                Open {atRisk.length} emails
              </button>
              <button className="btn" onClick={() => setShowEmailModal(false)}>Cancel</button>
            </div>
            <p style={{ fontSize: 12, color: '#aaa', marginTop: 10 }}>Each email opens in your default email client, pre-filled and ready to send.</p>
          </div>
        </div>
      )}

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-title">Generate report</div>
        <div className="form-group">
          <label>Course</label>
          <select value={selected} onChange={e => { setSelected(e.target.value); setReport(null); setError(''); }}>
            {courses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
          </select>
        </div>
        {error && <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 10 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={generate} disabled={loading}>
            {loading ? 'Loading...' : 'Generate'}
          </button>
          <button className="btn" onClick={exportExcel} disabled={exporting || !selected}>
            {exporting ? 'Exporting...' : 'Export Excel'}
          </button>
          {report && atRisk.length > 0 && (
            <button className="btn" onClick={() => setShowEmailModal(true)} style={{ background: '#fef9c3', borderColor: '#fde047', color: '#854d0e' }}>
              Email {atRisk.length} at-risk students
            </button>
          )}
        </div>
      </div>

      {report && (
        <>
          <div className="metrics">
            <div className="metric"><div className="metric-label">Total sessions</div><div className="metric-value">{report.sessions}</div></div>
            <div className="metric"><div className="metric-label">Enrolled</div><div className="metric-value">{report.report.length}</div></div>
            <div className="metric">
              <div className="metric-label">At risk (&lt;75%)</div>
              <div className="metric-value" style={{ color: atRisk.length > 0 ? '#b91c1c' : '#166534' }}>{atRisk.length}</div>
            </div>
          </div>

          {atRisk.length > 0 && (
            <div className="card" style={{ borderLeft: '4px solid #f87171', borderRadius: '0 10px 10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div className="card-title" style={{ margin: 0, color: '#b91c1c' }}>At-risk students</div>
                <button className="btn btn-sm" onClick={() => setShowEmailModal(true)} style={{ background: '#fef9c3', borderColor: '#fde047', color: '#854d0e', fontSize: 12 }}>
                  Send warnings
                </button>
              </div>
              <table>
                <thead><tr><th>Student</th><th>ID</th><th>Rate</th><th>Present</th><th>Late</th><th>Absent</th><th></th></tr></thead>
                <tbody>
                  {atRisk.map(s => (
                    <tr key={s.studentId}>
                      <td>{s.name}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{s.studentId}</td>
                      <td><strong style={{ color: '#b91c1c' }}>{s.rate}%</strong></td>
                      <td>{s.present}</td>
                      <td>{s.late}</td>
                      <td>{s.absent}</td>
                      <td><button className="btn btn-sm" onClick={() => openEmail(s)} style={{ fontSize: 12 }}>Email</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="card-title" style={{ margin: 0 }}>Full attendance - {report.course.code}</div>
              <span style={{ fontSize: 12, color: '#888' }}>{report.report.length} students</span>
            </div>
            <table>
              <thead><tr><th>Student</th><th>ID</th><th>Rate</th><th>Present</th><th>Late</th><th>Absent</th></tr></thead>
              <tbody>
                {[...report.report].sort((a, b) => a.rate - b.rate).map(s => (
                  <tr key={s.studentId}>
                    <td>{s.name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{s.studentId}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 6, background: '#e5e5e5', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${s.rate}%`, height: '100%', background: s.rate < 75 ? '#ef4444' : '#22c55e', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: s.rate < 75 ? '#b91c1c' : '#166534' }}>{s.rate}%</span>
                      </div>
                    </td>
                    <td>{s.present}</td>
                    <td>{s.late}</td>
                    <td>{s.absent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
