const { Pool } = require('pg');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function getDbConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'false' ? false : IS_PRODUCTION ? { rejectUnauthorized: false } : false,
    };
  }

  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'attendance_register',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '1234567',
  };

  if (IS_PRODUCTION) {
    const missing = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']
      .filter((key) => !String(process.env[key] || '').trim());
    if (missing.length) {
      throw new Error(`Missing required database environment variables: ${missing.join(', ')}`);
    }
  }

  return config;
}

module.exports = new Pool(getDbConfig());
