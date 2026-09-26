import db from '../index.js';

const SQLITE_PARAMETER_LIMIT = 900;

/**
 * 批量写入会话状态行，并按 SQLite 参数上限分块。
 * 表名、列名和冲突配置由查询模块提供，不接收用户输入。
 */
export function writeSessionStateRows({ table, columns, rows, conflict }) {
  if (rows.length === 0) return;

  const rowsPerStatement = Math.floor(SQLITE_PARAMETER_LIMIT / columns.length);
  // guard-allow(perf-shape): 每条 SQL 写入固定大小的数据块，避免逐行写入并遵守 SQLite 参数上限。
  for (let offset = 0; offset < rows.length; offset += rowsPerStatement) {
    const batch = rows.slice(offset, offset + rowsPerStatement);
    const values = batch.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    const conflictSql = conflict
      ? ` ON CONFLICT (${conflict.columns.join(', ')}) DO UPDATE SET ${conflict.updateColumns
        .map((column) => `${column} = excluded.${column}`).join(', ')}`
      : '';
    const statement = db.prepare(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values}${conflictSql}`,
    );
    const parameters = batch.flat();
    statement.run(...parameters);
  }
}

/** 在同一连接上原子执行多张会话状态表的恢复操作。 */
export function withSessionStateTransaction(callback) {
  return db.transaction(callback)();
}
