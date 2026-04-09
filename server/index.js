const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const ExcelJS = require('exceljs');
const multer = require('multer');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const pool = require('./db');
const createTables = require('./schema');

const app = express();
const PORT = Number(process.env.PORT || 3001);
const upload = multer({ storage: multer.memoryStorage() });
const LOCAL_SCAN_BASE_URL = `http://${getLocalIP()}:3000`;
const CLIENT_BUILD_DIR = path.join(__dirname, '..', 'client', 'build');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function buildCorsOptions() {
  if (!IS_PRODUCTION) return { origin: true };

  const allowedOrigins = new Set();
  try {
    const publicUrl = normalizeAppUrl(process.env.PUBLIC_APP_URL || '');
    if (publicUrl) allowedOrigins.add(publicUrl);
  } catch {
    // Let the explicit settings route surface invalid values instead.
  }

  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
  };
}

app.use(cors(buildCorsOptions()));
app.use(express.json());

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets))
    for (const net of nets[name])
      if (net.family === 'IPv4' && !net.internal && net.address.startsWith('192.168')) return net.address;
  for (const name of Object.keys(nets))
    for (const net of nets[name])
      if (net.family === 'IPv4' && !net.internal) return net.address;
  return 'localhost';
}

function normalizeAppUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Enter a valid full URL such as https://attendance.example.com');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('The public app URL must start with http:// or https://');
  }

  parsed.hash = '';
  parsed.search = '';

  let normalized = parsed.toString();
  if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized;
}

async function getAppSetting(key) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key=$1', [key]);
  return rows[0]?.value || '';
}

async function setAppSetting(key, value) {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
    [key, value]
  );
}

async function getScanBaseUrl() {
  const envUrl = normalizeAppUrl(process.env.PUBLIC_APP_URL || '');
  if (envUrl) return { url: envUrl, source: 'environment', lockedByEnv: true };

  const savedUrl = normalizeAppUrl(await getAppSetting('public_app_url'));
  if (savedUrl) return { url: savedUrl, source: 'settings', lockedByEnv: false };

  return { url: LOCAL_SCAN_BASE_URL, source: 'local', lockedByEnv: false };
}

function hashPassword(p) { return crypto.createHash('sha256').update(p).digest('hex'); }
function generateToken() { return crypto.randomBytes(32).toString('hex'); }
const SESSION_TTL_DAYS = 7;

function mapUser(row) {
  return { ...row, mustChangePassword: row.must_change_password, createdAt: row.created_at };
}

function mapCourse(row) {
  return { ...row, lecturerId: row.lecturer_id, courseId: row.id, createdAt: row.created_at };
}

function mapStudent(row) {
  return { ...row, studentId: row.student_id, courseId: row.course_id, createdAt: row.created_at };
}

function mapSession(row) {
  return {
    ...row,
    courseId: row.course_id,
    lecturerId: row.lecturer_id,
    courseName: row.course_name,
    courseCode: row.course_code,
    windowMinutes: row.window_minutes,
    lateThresholdMinutes: row.late_threshold_minutes,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    lateAfter: row.late_after,
    qrDataUrl: row.qr_data_url,
    scanUrl: row.scan_url,
  };
}

function mapAttendance(row) {
  return {
    ...row,
    sessionId: row.session_id,
    courseId: row.course_id,
    studentId: row.student_id,
    studentName: row.student_name,
    scannedAt: row.scanned_at,
  };
}

async function createAuthToken(userId) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await pool.query('INSERT INTO auth_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, userId, expiresAt]);
  return token;
}

async function deleteAuthToken(token) {
  if (!token) return;
  await pool.query('DELETE FROM auth_tokens WHERE token=$1', [token]);
}

async function getUserFromToken(token) {
  if (!token) return null;

  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.must_change_password, t.expires_at
     FROM auth_tokens t
     JOIN users u ON u.id=t.user_id
     WHERE t.token=$1`,
    [token]
  );

  if (!rows.length) return null;

  const row = rows[0];
  if (new Date(row.expires_at) <= new Date()) {
    await deleteAuthToken(token);
    return null;
  }

  return { userId: row.id, name: row.name, email: row.email, role: row.role, mustChangePassword: row.must_change_password };
}

async function getAccessibleCourse(user, courseId) {
  if (!courseId) return null;

  const query = user.role === 'admin'
    ? 'SELECT * FROM courses WHERE id=$1'
    : 'SELECT * FROM courses WHERE id=$1 AND lecturer_id=$2';
  const params = user.role === 'admin' ? [courseId] : [courseId, user.userId];
  const { rows } = await pool.query(query, params);
  return rows[0] || null;
}

async function getAccessibleSession(user, sessionId) {
  if (!sessionId) return null;

  const query = user.role === 'admin'
    ? 'SELECT * FROM sessions WHERE id=$1'
    : 'SELECT * FROM sessions WHERE id=$1 AND lecturer_id=$2';
  const params = user.role === 'admin' ? [sessionId] : [sessionId, user.userId];
  const { rows } = await pool.query(query, params);
  return rows[0] || null;
}

async function requireAuth(req, res, next) {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    const user = await getUserFromToken(token);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    req.user = user;
    req.token = token;
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only.' });
    next();
  });
}

// AUTH
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptimeSeconds: Math.round(process.uptime()) });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1 AND password=$2', [email, hashPassword(password)]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid email or password.' });
    const user = rows[0];
    const token = await createAuthToken(user.id);
    res.json({ token, role: user.role, name: user.name, email: user.email, mustChangePassword: user.must_change_password });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  await deleteAuthToken(req.token);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.user));

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1 AND password=$2', [req.user.userId, hashPassword(currentPassword)]);
    if (!rows.length) return res.status(401).json({ error: 'Current password is incorrect.' });
    await pool.query('UPDATE users SET password=$1, must_change_password=FALSE WHERE id=$2', [hashPassword(newPassword), req.user.userId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SETTINGS
app.get('/api/settings/network', requireAuth, async (req, res) => {
  try {
    const configuredPublicAppUrl = normalizeAppUrl(await getAppSetting('public_app_url'));
    const effective = await getScanBaseUrl();
    res.json({
      publicAppUrl: configuredPublicAppUrl,
      effectiveScanBaseUrl: effective.url,
      source: effective.source,
      lockedByEnv: effective.lockedByEnv,
      localFallbackUrl: LOCAL_SCAN_BASE_URL,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/settings/network', requireAdmin, async (req, res) => {
  try {
    if (process.env.PUBLIC_APP_URL && String(process.env.PUBLIC_APP_URL).trim()) {
      return res.status(400).json({ error: 'PUBLIC_APP_URL is set on the server, so this setting is locked there.' });
    }

    const publicAppUrl = normalizeAppUrl(req.body.publicAppUrl || '');
    await setAppSetting('public_app_url', publicAppUrl);
    const effective = await getScanBaseUrl();
    res.json({
      ok: true,
      publicAppUrl,
      effectiveScanBaseUrl: effective.url,
      source: effective.source,
      lockedByEnv: effective.lockedByEnv,
      localFallbackUrl: LOCAL_SCAN_BASE_URL,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// USERS
app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name, email, role, must_change_password, created_at FROM users ORDER BY created_at');
    res.json(rows.map(mapUser));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ error: 'All fields required.' });
    const { rows } = await pool.query(
      'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,TRUE) RETURNING id,name,email,role,must_change_password,created_at',
      [name, email, hashPassword(password), role]
    );
    res.json(mapUser(rows[0]));
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists.' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// COURSES
app.get('/api/courses', requireAuth, async (req, res) => {
  try {
    const q = req.user.role === 'admin'
      ? 'SELECT * FROM courses ORDER BY created_at'
      : 'SELECT * FROM courses WHERE lecturer_id=$1 ORDER BY created_at';
    const { rows } = req.user.role === 'admin'
      ? await pool.query(q)
      : await pool.query(q, [req.user.userId]);
    res.json(rows.map(mapCourse));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/courses', requireAdmin, async (req, res) => {
  try {
    const { code, name, lecturer, lecturerId } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO courses (code,name,lecturer,lecturer_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [code, name, lecturer, lecturerId || null]
    );
    res.json(mapCourse(rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/courses/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM courses WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// STUDENTS
app.get('/api/students', requireAuth, async (req, res) => {
  try {
    const query = req.user.role === 'admin'
      ? 'SELECT * FROM students ORDER BY name'
      : `SELECT s.*
         FROM students s
         JOIN courses c ON c.id=s.course_id
         WHERE c.lecturer_id=$1
         ORDER BY s.name`;
    const { rows } = req.user.role === 'admin'
      ? await pool.query(query)
      : await pool.query(query, [req.user.userId]);
    res.json(rows.map(mapStudent));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/students', requireAdmin, async (req, res) => {
  try {
    const { name, studentId, email, courseId } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO students (name,student_id,email,course_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, studentId, email || null, courseId || null]
    );
    res.json(mapStudent(rows[0]));
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Student ID already exists.' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/students/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM students WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// STUDENT QR + IMPORT
app.get('/api/students/:id/qr', requireAuth, async (req, res) => {
  try {
    const query = req.user.role === 'admin'
      ? 'SELECT s.*, c.name as course_name, c.code as course_code FROM students s LEFT JOIN courses c ON s.course_id=c.id WHERE s.id=$1'
      : `SELECT s.*, c.name as course_name, c.code as course_code
         FROM students s
         JOIN courses c ON s.course_id=c.id
         WHERE s.id=$1 AND c.lecturer_id=$2`;
    const params = req.user.role === 'admin' ? [req.params.id] : [req.params.id, req.user.userId];
    const { rows } = await pool.query(query, params);
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    const s = rows[0];
    const qrDataUrl = await QRCode.toDataURL(s.student_id);
    res.json({ qrDataUrl, student: s, courseName: s.course_name || '', courseCode: s.course_code || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/students/qr-cards', requireAuth, async (req, res) => {
  try {
    let query;
    let params;

    if (req.user.role === 'admin') {
      query = `SELECT s.id, s.name, s.student_id, s.course_id, c.name as course_name, c.code as course_code
               FROM students s
               LEFT JOIN courses c ON s.course_id=c.id
               WHERE ($1::uuid IS NULL OR s.course_id=$1)
               ORDER BY s.name`;
      params = [req.query.courseId || null];
    } else {
      query = `SELECT s.id, s.name, s.student_id, s.course_id, c.name as course_name, c.code as course_code
               FROM students s
               JOIN courses c ON s.course_id=c.id
               WHERE c.lecturer_id=$1 AND ($2::uuid IS NULL OR s.course_id=$2)
               ORDER BY s.name`;
      params = [req.user.userId, req.query.courseId || null];
    }

    const { rows } = await pool.query(query, params);
    const cards = await Promise.all(rows.map(async (student) => ({
      id: student.id,
      studentId: student.student_id,
      qrDataUrl: await QRCode.toDataURL(student.student_id),
      courseId: student.course_id,
      courseName: student.course_name || '',
      courseCode: student.course_code || '',
    })));

    res.json(cards);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/students/import', requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const ext = req.file.originalname.split('.').pop().toLowerCase();
  if (ext !== 'csv') return res.status(400).json({ error: 'Only CSV files supported.' });
  let rows = [];
  try {
    const lines = req.file.buffer.toString('utf8').split(/\r?\n/).filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row = {}; headers.forEach((h, idx) => { row[h] = vals[idx] || ''; }); rows.push(row);
    }
  } catch (e) { return res.status(400).json({ error: 'Could not parse file: ' + e.message }); }
  const results = { added: [], skipped: [], errors: [] };
  for (const row of rows) {
    const name = row['name'] || row['fullname'] || '';
    const studentId = row['studentid'] || row['id'] || '';
    const email = row['email'] || '';
    const courseCode = (row['coursecode'] || row['course'] || '').toUpperCase().trim();
    if (!name || !studentId) { results.errors.push({ reason: 'Missing name or student ID' }); continue; }
    try {
      const course = courseCode ? await pool.query('SELECT id,code FROM courses WHERE UPPER(code)=$1', [courseCode]) : { rows: [] };
      const courseId = course.rows[0]?.id || null;
      await pool.query('INSERT INTO students (name,student_id,email,course_id) VALUES ($1,$2,$3,$4)', [name, studentId, email || null, courseId]);
      results.added.push({ studentId, name, course: course.rows[0]?.code || 'unassigned' });
    } catch (e) {
      if (e.code === '23505') results.skipped.push({ studentId, name, reason: 'Already exists' });
      else results.errors.push({ reason: e.message });
    }
  }
  res.json(results);
});

// SESSIONS
app.get('/api/sessions', requireAuth, async (req, res) => {
  try {
    const q = req.user.role === 'admin'
      ? 'SELECT * FROM sessions ORDER BY started_at DESC'
      : 'SELECT * FROM sessions WHERE lecturer_id=$1 ORDER BY started_at DESC';
    const { rows } = req.user.role === 'admin' ? await pool.query(q) : await pool.query(q, [req.user.userId]);
    res.json(rows.map(mapSession));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sessions/start', requireAuth, async (req, res) => {
  try {
    const { courseId, windowMinutes = 10, lateThresholdMinutes = 5 } = req.body;
    const course = await getAccessibleCourse(req.user, courseId);
    if (!course) return res.status(404).json({ error: 'Course not found or not accessible.' });
    const sessionCode = uuidv4().split('-')[0].toUpperCase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + windowMinutes * 60000);
    const lateAfter = new Date(now.getTime() + lateThresholdMinutes * 60000);
    const { rows: sess } = await pool.query(
      `INSERT INTO sessions (course_id,course_name,course_code,lecturer_id,lecturer_name,session_code,expires_at,late_after,window_minutes,late_threshold_minutes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [courseId, course.name, course.code, req.user.userId, req.user.name, sessionCode, expiresAt, lateAfter, windowMinutes, lateThresholdMinutes]
    );
    const session = sess[0];
    const { url: scanBaseUrl } = await getScanBaseUrl();
    const scanUrl = `${scanBaseUrl}/scan/${session.id}/${sessionCode}`;
    const qrDataUrl = await QRCode.toDataURL(scanUrl);
    await pool.query('UPDATE sessions SET qr_data_url=$1, scan_url=$2 WHERE id=$3', [qrDataUrl, scanUrl, session.id]);
    res.json(mapSession({ ...session, qr_data_url: qrDataUrl, scan_url: scanUrl }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sessions/:id/close', requireAuth, async (req, res) => {
  try {
    const session = await getAccessibleSession(req.user, req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const { rows } = await pool.query('UPDATE sessions SET active=FALSE WHERE id=$1 RETURNING *', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sessions/:id/refresh-qr', requireAuth, async (req, res) => {
  try {
    const session = await getAccessibleSession(req.user, req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    if (!session.active || new Date() > new Date(session.expires_at)) return res.status(400).json({ error: 'Session not active.' });
    const newCode = uuidv4().split('-')[0].toUpperCase();
    const { url: scanBaseUrl } = await getScanBaseUrl();
    const scanUrl = `${scanBaseUrl}/scan/${session.id}/${newCode}`;
    const qrDataUrl = await QRCode.toDataURL(scanUrl);
    await pool.query('UPDATE sessions SET session_code=$1, qr_data_url=$2, scan_url=$3 WHERE id=$4', [newCode, qrDataUrl, scanUrl, session.id]);
    res.json({ sessionCode: newCode, qrDataUrl, scanUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sessions/:id/manual-attendance', requireAuth, async (req, res) => {
  try {
    const { records } = req.body;
    const session = await getAccessibleSession(req.user, req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    const results = { added: [], skipped: [] };
    for (const r of records) {
      const { studentId, status } = r;
      if (!studentId || !['present','late','absent'].includes(status) || status === 'absent') { results.skipped.push(studentId); continue; }
      try {
        const { rows: sr } = await pool.query('SELECT name FROM students WHERE student_id=$1 AND course_id=$2', [studentId, session.course_id]);
        if (!sr.length) { results.skipped.push(studentId); continue; }
        await pool.query('INSERT INTO attendance (session_id,course_id,student_id,student_name,status,manual) VALUES ($1,$2,$3,$4,$5,TRUE) ON CONFLICT (session_id,student_id) DO NOTHING',
          [session.id, session.course_id, studentId, sr[0]?.name || studentId, status]);
        results.added.push(studentId);
      } catch { results.skipped.push(studentId); }
    }
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SCAN (no auth - students)
app.post('/api/scan', async (req, res) => {
  try {
    const { sessionId, sessionCode, studentId } = req.body;
    const { rows: sr } = await pool.query('SELECT * FROM sessions WHERE id=$1 AND session_code=$2', [sessionId, sessionCode]);
    if (!sr.length) return res.status(404).json({ error: 'Invalid session or code.' });
    const session = sr[0];
    if (!session.active) return res.status(400).json({ error: 'This session has ended.' });
    if (new Date() > new Date(session.expires_at)) {
      await pool.query('UPDATE sessions SET active=FALSE WHERE id=$1', [session.id]);
      return res.status(400).json({ error: 'This QR code has expired.' });
    }
    const { rows: stud } = await pool.query('SELECT * FROM students WHERE student_id=$1 AND course_id=$2', [studentId, session.course_id]);
    if (!stud.length) return res.status(404).json({ error: 'Student ID not found.' });
    const status = new Date() > new Date(session.late_after) ? 'late' : 'present';
    try {
      await pool.query('INSERT INTO attendance (session_id,course_id,student_id,student_name,status) VALUES ($1,$2,$3,$4,$5)',
        [session.id, session.course_id, studentId, stud[0].name, status]);
    } catch (e) {
      if (e.code === '23505') return res.status(400).json({ error: 'Already marked for this session.' });
      throw e;
    }
    res.json({ success: true, status, studentName: stud[0].name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/attendance', requireAuth, async (req, res) => {
  try {
    let q = req.user.role === 'admin'
      ? 'SELECT a.* FROM attendance a WHERE 1=1'
      : `SELECT a.*
         FROM attendance a
         JOIN sessions s ON s.id=a.session_id
         WHERE s.lecturer_id=$1`;
    const params = req.user.role === 'admin' ? [] : [req.user.userId];
    if (req.query.sessionId) { params.push(req.query.sessionId); q += ` AND a.session_id=$${params.length}`; }
    if (req.query.courseId) { params.push(req.query.courseId); q += ` AND a.course_id=$${params.length}`; }
    q += ' ORDER BY scanned_at';
    const { rows } = await pool.query(q, params);
    res.json(rows.map(mapAttendance));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// REPORTS
app.get('/api/reports/course/:courseId', requireAuth, async (req, res) => {
  try {
    const course = await getAccessibleCourse(req.user, req.params.courseId);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    const { rows: sessions } = await pool.query('SELECT * FROM sessions WHERE course_id=$1', [req.params.courseId]);
    const { rows: enrolled } = await pool.query('SELECT * FROM students WHERE course_id=$1', [req.params.courseId]);
    const { rows: attendance } = await pool.query('SELECT * FROM attendance WHERE course_id=$1', [req.params.courseId]);
    const report = enrolled.map(student => {
      const records = attendance.filter(a => a.student_id === student.student_id);
      const present = records.filter(r => r.status === 'present').length;
      const late = records.filter(r => r.status === 'late').length;
      const rate = sessions.length > 0 ? Math.round(((present + late) / sessions.length) * 100) : 0;
      return { studentId: student.student_id, name: student.name, email: student.email || '', present, late, absent: sessions.length - present - late, rate };
    });
    res.json({ course, sessions: sessions.length, report });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// EXPORT EXCEL
app.get('/api/export/course/:courseId', requireAuth, async (req, res) => {
  try {
    const course = await getAccessibleCourse(req.user, req.params.courseId);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    const { rows: sessions } = await pool.query('SELECT * FROM sessions WHERE course_id=$1', [req.params.courseId]);
    const { rows: enrolled } = await pool.query('SELECT * FROM students WHERE course_id=$1', [req.params.courseId]);
    const { rows: attendance } = await pool.query('SELECT * FROM attendance WHERE course_id=$1', [req.params.courseId]);
    const report = enrolled.map(student => {
      const records = attendance.filter(a => a.student_id === student.student_id);
      const present = records.filter(r => r.status === 'present').length;
      const late = records.filter(r => r.status === 'late').length;
      const rate = sessions.length > 0 ? Math.round(((present + late) / sessions.length) * 100) : 0;
      return { studentId: student.student_id, name: student.name, present, late, absent: sessions.length - present - late, rate };
    });
    const wb = new ExcelJS.Workbook();
    const hS = { font:{bold:true,color:{argb:'FFFFFFFF'}}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FF2563EB'}}, alignment:{horizontal:'center'} };
    const rS = { fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFFEE2E2'}} };
    const gS = { fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFDCFCE7'}} };
    const sum = wb.addWorksheet('Summary');
    sum.columns=[{width:20},{width:40}];
    [['Course Code',course.code],['Course Name',course.name],['Lecturer',course.lecturer||'—'],['Total Sessions',sessions.length],['Enrolled',enrolled.length],['At Risk (<75%)',report.filter(s=>s.rate<75).length],['Export Date',new Date().toLocaleDateString()]].forEach(r=>sum.addRow(r));
    const sh = wb.addWorksheet('Attendance');
    sh.columns=[{header:'Student ID',key:'studentId',width:18},{header:'Name',key:'name',width:28},{header:'Present',key:'present',width:12},{header:'Late',key:'late',width:12},{header:'Absent',key:'absent',width:12},{header:'Rate',key:'rate',width:14},{header:'Status',key:'status',width:12}];
    sh.getRow(1).eachCell(c=>Object.assign(c,hS));
    report.sort((a,b)=>a.rate-b.rate).forEach(s=>{const row=sh.addRow({...s,rate:s.rate+'%',status:s.rate<75?'At Risk':'OK'});s.rate<75?row.eachCell(c=>Object.assign(c,rS)):row.eachCell(c=>Object.assign(c,gS));});
    const ar=wb.addWorksheet('At Risk');
    ar.columns=[{header:'Student ID',key:'studentId',width:18},{header:'Name',key:'name',width:28},{header:'Rate',key:'rate',width:14},{header:'Present',key:'present',width:12},{header:'Late',key:'late',width:12},{header:'Absent',key:'absent',width:12}];
    ar.getRow(1).eachCell(c=>Object.assign(c,hS));
    report.filter(s=>s.rate<75).forEach(s=>{const row=ar.addRow({...s,rate:s.rate+'%'});row.eachCell(c=>Object.assign(c,rS));});
    const ss=wb.addWorksheet('Sessions');
    ss.columns=[{header:'Date',key:'date',width:16},{header:'Time',key:'time',width:12},{header:'Code',key:'code',width:14},{header:'Window (min)',key:'window',width:14},{header:'Scans',key:'scans',width:10}];
    ss.getRow(1).eachCell(c=>Object.assign(c,hS));
    sessions.forEach(s=>{const scans=attendance.filter(a=>a.session_id===s.id).length;ss.addRow({date:new Date(s.started_at).toLocaleDateString(),time:new Date(s.started_at).toLocaleTimeString(),code:s.session_code,window:s.window_minutes,scans});});
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="${course.code.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx"`);
    await wb.xlsx.write(res); res.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// EMAIL ALERT
app.post('/api/email-alert', requireAuth, async (req, res) => {
  try {
    const { studentId, studentName } = req.body;
    const query = req.user.role === 'admin'
      ? 'SELECT s.email FROM students s WHERE s.student_id=$1'
      : `SELECT s.email
         FROM students s
         JOIN courses c ON c.id=s.course_id
         WHERE s.student_id=$1 AND c.lecturer_id=$2`;
    const params = req.user.role === 'admin' ? [studentId] : [studentId, req.user.userId];
    const { rows } = await pool.query(query, params);
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    if (!rows[0].email) return res.status(400).json({ error: `No email on file for ${studentName}.` });
    res.json({ ok: true, to: rows[0].email, studentName });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

if (IS_PRODUCTION) {
  app.use(express.static(CLIENT_BUILD_DIR));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(CLIENT_BUILD_DIR, 'index.html'));
  });
}

// START SERVER
async function start() {
  try {
    await createTables();
    await pool.query('DELETE FROM auth_tokens WHERE expires_at <= NOW()');
    // Seed default admin if no users exist
    const { rows } = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count) === 0) {
      await pool.query(
        'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,$5)',
        ['Admin', 'admin@university.edu', require('crypto').createHash('sha256').update('admin123').digest('hex'), 'admin', true]
      );
      console.log('Default admin created: admin@university.edu / admin123');
    }
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log(`Local scan base: ${LOCAL_SCAN_BASE_URL}`);
      if (IS_PRODUCTION) console.log(`Serving frontend from: ${CLIENT_BUILD_DIR}`);
      if (process.env.PUBLIC_APP_URL && String(process.env.PUBLIC_APP_URL).trim()) {
        console.log(`Public app URL: ${normalizeAppUrl(process.env.PUBLIC_APP_URL)}`);
      }
      console.log(`Database: PostgreSQL (attendance_register)`);
    });
  } catch (e) {
    console.error('Failed to start server:', e.message);
    process.exit(1);
  }
}

start();
