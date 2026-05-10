import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger, formatMeta } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.WE_DB_PATH
  || (process.env.WE_DATA_DIR
    ? path.resolve(process.env.WE_DATA_DIR, 'worldengine.db')
    : path.resolve(__dirname, '..', '..', 'data', 'worldengine.db'));

const db = new Database(DB_PATH);

// 每次连接后立即开启外键约束
db.pragma('foreign_keys = ON');

const dbLog = createLogger('db', 'blue');
const SLOW_QUERY_MS = 200;
const _origPrepare = db.prepare.bind(db);
db.prepare = (sql) => {
  const stmt = _origPrepare(sql);
  for (const m of ['run', 'get', 'all']) {
    if (typeof stmt[m] !== 'function') continue;
    const orig = stmt[m].bind(stmt);
    stmt[m] = (...args) => {
      const t = Date.now();
      try {
        return orig(...args);
      } catch (err) {
        dbLog.error(`sql.${m}.error ${formatMeta({ sql: sql.slice(0, 120), msg: err?.message })}`);
        throw err;
      } finally {
        const ms = Date.now() - t;
        if (ms >= SLOW_QUERY_MS) {
          dbLog.warn(`sql.slow ${formatMeta({ ms, method: m, sql: sql.slice(0, 120) })}`);
        }
      }
    };
  }
  return stmt;
};

export default db;
