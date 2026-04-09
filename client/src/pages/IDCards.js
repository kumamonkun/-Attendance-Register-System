import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../AuthContext';

export default function IDCards() {
  const { authFetch } = useAuth();
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [cards, setCards] = useState({});
  const [filterCourse, setFilterCourse] = useState('all');
  const [loading, setLoading] = useState(false);
  const printRef = useRef(null);

  useEffect(() => {
    authFetch('/api/students').then(r => r.json()).then(setStudents);
    authFetch('/api/courses').then(r => r.json()).then(setCourses);
  }, [authFetch]);

  useEffect(() => {
    const loadCards = async () => {
      setLoading(true);
      try {
        const query = filterCourse === 'all' ? '' : `?courseId=${encodeURIComponent(filterCourse)}`;
        const res = await authFetch(`/api/students/qr-cards${query}`);
        const data = await res.json();
        const nextCards = {};
        data.forEach(card => { nextCards[card.id] = card; });
        setCards(current => ({ ...current, ...nextCards }));
      } finally {
        setLoading(false);
      }
    };

    loadCards();
  }, [authFetch, filterCourse]);

  const filtered = useMemo(
    () => (filterCourse === 'all' ? students : students.filter(s => s.courseId === filterCourse)),
    [filterCourse, students]
  );

  const courseName = id => courses.find(c => c.id === id)?.name || '';
  const courseCode = id => courses.find(c => c.id === id)?.code || '';

  const escapeHtml = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) return;

    const printableCards = filtered.map(s => {
      const card = cards[s.id];
      const qrMarkup = card?.qrDataUrl
        ? `<img src="${card.qrDataUrl}" alt="QR code for ${escapeHtml(s.name)}" />`
        : '<div class="qr-placeholder">QR unavailable</div>';

      return `
        <article class="print-card">
          <div class="print-card-header">
            <div class="print-card-label">Student ID Card</div>
            <div class="print-card-name">${escapeHtml(s.name)}</div>
          </div>
          <div class="print-card-body">
            ${qrMarkup}
            <div class="print-student-id">${escapeHtml(s.studentId)}</div>
            <div class="print-course">${escapeHtml(courseCode(s.courseId))} - ${escapeHtml(courseName(s.courseId))}</div>
            <div class="print-note">Scan to mark attendance</div>
          </div>
        </article>
      `;
    }).join('');

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Student ID Cards</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              font-family: "Segoe UI", Arial, sans-serif;
              color: #1a1a1a;
              background: #fff;
            }
            .page {
              padding: 18mm 12mm;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 10mm 7mm;
            }
            .print-card {
              border: 1px solid #d1d5db;
              border-radius: 10px;
              overflow: hidden;
              background: #fff;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .print-card-header {
              background: #2563eb;
              color: #fff;
              padding: 10px 12px;
            }
            .print-card-label {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              opacity: 0.9;
              margin-bottom: 4px;
            }
            .print-card-name {
              font-size: 15px;
              font-weight: 700;
              line-height: 1.25;
            }
            .print-card-body {
              padding: 14px 12px 16px;
              text-align: center;
            }
            .print-card img,
            .qr-placeholder {
              width: 104px;
              height: 104px;
              margin: 0 auto 10px;
              display: block;
              border: 1px solid #e5e7eb;
              border-radius: 6px;
              background: #fff;
            }
            .qr-placeholder {
              font-size: 11px;
              color: #9ca3af;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .print-student-id {
              font-size: 14px;
              font-weight: 700;
              margin-bottom: 6px;
            }
            .print-course {
              font-size: 12px;
              color: #4b5563;
              line-height: 1.3;
              min-height: 32px;
              margin-bottom: 8px;
            }
            .print-note {
              font-size: 10px;
              color: #9ca3af;
            }
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
          </style>
        </head>
        <body>
          <main class="page">
            <section class="grid">${printableCards}</section>
          </main>
          <script>
            window.onload = function () {
              setTimeout(function () {
                window.print();
              }, 250);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
  };

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .card-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 12px !important; }
          body { background: white; }
          .id-card { break-inside: avoid; box-shadow: none !important; border: 1px solid #ccc !important; }
        }
      `}</style>

      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Student ID cards</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14 }}>
            <option value="all">All courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
          <button className="btn btn-primary" onClick={handlePrint} disabled={loading}>
            {loading ? 'Loading...' : 'Print cards'}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p style={{ fontSize: 14, color: '#888' }}>No students found. Add students first.</p>
      ) : (
        <div ref={printRef} className="card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {filtered.map(s => {
            const card = cards[s.id];

            return (
              <div key={s.id} className="id-card" style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ width: '100%', background: '#2563eb', borderRadius: 8, padding: '10px 14px', color: '#fff' }}>
                  <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Student ID Card</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{s.name}</div>
                </div>
                {card?.qrDataUrl ? (
                  <img src={card.qrDataUrl} alt="QR" style={{ width: 120, height: 120, borderRadius: 6, border: '1px solid #e5e5e5' }} />
                ) : (
                  <div style={{ width: 120, height: 120, background: '#f5f5f5', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#aaa' }}>Loading...</div>
                )}
                <div style={{ width: '100%', fontSize: 13, color: '#555', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#1a1a1a', marginBottom: 4 }}>{s.studentId}</div>
                  <div>{courseCode(s.courseId)} - {courseName(s.courseId)}</div>
                </div>
                <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center' }}>Scan to mark attendance</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
