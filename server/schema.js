const pool = require('./db');

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'lecturer',
      must_change_password BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS courses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      lecturer TEXT,
      lecturer_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS students (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      student_id TEXT UNIQUE NOT NULL,
      email TEXT,
      course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
      course_name TEXT,
      course_code TEXT,
      lecturer_id UUID REFERENCES users(id) ON DELETE SET NULL,
      lecturer_name TEXT,
      session_code TEXT NOT NULL,
      qr_data_url TEXT,
      scan_url TEXT,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      late_after TIMESTAMPTZ NOT NULL,
      window_minutes INTEGER DEFAULT 10,
      late_threshold_minutes INTEGER DEFAULT 5,
      active BOOLEAN DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
      course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL,
      student_name TEXT,
      status TEXT NOT NULL CHECK (status IN ('present','late','absent')),
      scanned_at TIMESTAMPTZ DEFAULT NOW(),
      manual BOOLEAN DEFAULT FALSE,
      UNIQUE(session_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      token TEXT PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log('Tables ready.');
}

module.exports = createTables;
