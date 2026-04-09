import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../AuthContext';

export default function Import() {
  const { authFetch } = useAuth();
  const [courses, setCourses] = useState([]);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef();

  useEffect(() => {
    authFetch('/api/courses').then(r => r.json()).then(setCourses);
  }, [authFetch]);

  const parsePreview = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 6);
      const headers = lines[0]?.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const rows = lines.slice(1).map(l =>
        l.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      );
      setPreview({ headers, rows });
    };
    reader.readAsText(file);
  };

  const handleFile = (f) => {
    setError('');
    setResult(null);
    if (!f) return;
    if (!f.name.endsWith('.csv')) {
      setError('Please upload a CSV file. In Excel: File → Save As → CSV.');
      return;
    }
    setFile(f);
    parsePreview(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const doImport = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError('');
    const form = new FormData();
    form.append('file', file);
    const res = await authFetch('/api/students/import', {
      method: 'POST',
      body: form,
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else setResult(data);
    setLoading(false);
  };

  const reset = () => {
    setFile(null); setPreview(null); setResult(null); setError('');
  };

  return (
    <div>
      <h1 className="page-title">Bulk import students</h1>

      {/* Template download hint */}
      <div className="card" style={{ maxWidth: 560, background: '#eff6ff', borderColor: '#bfdbfe' }}>
        <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: '#1e40af' }}>CSV template format</p>
        <p style={{ fontSize: 13, color: '#1e40af', marginBottom: 10 }}>
          Your CSV file needs these column headers (in any order):
        </p>
        <code style={{ fontSize: 12, background: '#dbeafe', padding: '6px 10px', borderRadius: 6, display: 'block', color: '#1e40af' }}>
          name, studentId, email, courseCode
        </code>
        <p style={{ fontSize: 12, color: '#3b82f6', marginTop: 8 }}>
          Example row: <code>Amalia Nghifikepunye, STU-2024-001, amalia@uni.edu, CS301</code>
        </p>
        <p style={{ fontSize: 12, color: '#3b82f6', marginTop: 4 }}>
          Available courses: {courses.length === 0 ? 'none yet' : courses.map(c => c.code).join(', ')}
        </p>
      </div>

      {/* Drop zone */}
      {!result && (
        <div style={{ maxWidth: 560, marginTop: 16 }}>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#2563eb' : file ? '#22c55e' : '#d1d5db'}`,
              borderRadius: 12, padding: '32px 20px', textAlign: 'center',
              cursor: 'pointer', background: dragging ? '#eff6ff' : file ? '#f0fdf4' : '#fafafa',
              transition: 'all 0.15s',
            }}>
            <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])} />
            <div style={{ fontSize: 32, marginBottom: 8 }}>{file ? '✅' : '📄'}</div>
            {file
              ? <p style={{ fontSize: 14, fontWeight: 500, color: '#166534' }}>{file.name}</p>
              : <>
                  <p style={{ fontSize: 14, fontWeight: 500, color: '#555' }}>Drop your CSV file here</p>
                  <p style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>or click to browse</p>
                </>
            }
          </div>

          {error && <p style={{ fontSize: 13, color: '#b91c1c', marginTop: 10 }}>{error}</p>}

          {/* Preview table */}
          {preview && !error && (
            <div className="card" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', fontSize: 13, fontWeight: 500, color: '#555' }}>
                Preview (first 5 rows)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>{preview.headers?.map((h, i) => <th key={i}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.rows?.map((r, i) => (
                      <tr key={i}>{r.map((v, j) => <td key={j} style={{ fontSize: 13 }}>{v || <span style={{ color: '#ccc' }}>—</span>}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {file && !error && (
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" onClick={doImport} disabled={loading}>
                {loading ? 'Importing...' : 'Import students'}
              </button>
              <button className="btn" onClick={reset}>Clear</button>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {result && (
        <div style={{ maxWidth: 560 }}>
          <div className="metrics" style={{ marginTop: 16 }}>
            <div className="metric">
              <div className="metric-label">Added</div>
              <div className="metric-value" style={{ color: '#166534' }}>{result.added.length}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Skipped</div>
              <div className="metric-value" style={{ color: '#854d0e' }}>{result.skipped.length}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Errors</div>
              <div className="metric-value" style={{ color: result.errors.length > 0 ? '#b91c1c' : '#166534' }}>{result.errors.length}</div>
            </div>
          </div>

          {result.added.length > 0 && (
            <div className="card" style={{ borderLeft: '4px solid #22c55e', borderRadius: '0 10px 10px 0' }}>
              <div className="card-title" style={{ color: '#166534' }}>Added ({result.added.length})</div>
              <table>
                <thead><tr><th>Student ID</th><th>Name</th><th>Course</th></tr></thead>
                <tbody>
                  {result.added.map(s => (
                    <tr key={s.studentId}>
                      <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{s.studentId}</td>
                      <td>{s.name}</td>
                      <td><span className="badge badge-active">{s.course}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.skipped.length > 0 && (
            <div className="card" style={{ borderLeft: '4px solid #fde047', borderRadius: '0 10px 10px 0' }}>
              <div className="card-title" style={{ color: '#854d0e' }}>Skipped — already exist ({result.skipped.length})</div>
              <table>
                <thead><tr><th>Student ID</th><th>Name</th><th>Reason</th></tr></thead>
                <tbody>
                  {result.skipped.map(s => (
                    <tr key={s.studentId}>
                      <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{s.studentId}</td>
                      <td>{s.name}</td>
                      <td style={{ fontSize: 12, color: '#888' }}>{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="card" style={{ borderLeft: '4px solid #f87171', borderRadius: '0 10px 10px 0' }}>
              <div className="card-title" style={{ color: '#b91c1c' }}>Errors ({result.errors.length})</div>
              {result.errors.map((e, i) => (
                <p key={i} style={{ fontSize: 13, color: '#b91c1c', marginBottom: 4 }}>Row {i + 1}: {e.reason}</p>
              ))}
            </div>
          )}

          <button className="btn btn-primary" onClick={reset} style={{ marginTop: 8 }}>Import another file</button>
        </div>
      )}
    </div>
  );
}
