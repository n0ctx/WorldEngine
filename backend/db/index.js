import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.WE_DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'worldengine.db');

const db = new Database(DB_PATH);

// 每次连接后立即开启外键约束
db.pragma('foreign_keys = ON');

export default db;
