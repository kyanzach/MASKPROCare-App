/**
 * MySQL2 Connection Pool
 * Uses promise-based pool for async/await queries.
 * Timezone set to Asia/Manila (+08:00).
 */

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'omnimpdb',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+08:00',
  charset: 'utf8mb4',
  // Fix: After Unify's utf8mb4_general_ci migration, mysql2 returns text columns
  // as Buffers instead of strings. typeCast converts them back to UTF-8 strings.
  typeCast: function (field, next) {
    if (field.type === 'VAR_STRING' || field.type === 'STRING' ||
        field.type === 'TINY_BLOB' || field.type === 'MEDIUM_BLOB' ||
        field.type === 'LONG_BLOB' || field.type === 'BLOB') {
      const val = field.buffer();
      return val ? val.toString('utf8') : null;
    }
    return next();
  },
});

// Test connection on startup
(async () => {
  try {
    const conn = await pool.getConnection();
    await conn.query("SET time_zone = '+08:00'");
    console.log(`✅ MySQL connected: ${process.env.DB_NAME || 'omnimpdb'}`);
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
  }
})();

module.exports = pool;
