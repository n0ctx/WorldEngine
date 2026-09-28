import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { initSchema } from '../db/schema.js';

test('initSchema upgrades legacy sessions and recreates their indexes', () => {
  const db = new Database(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE worlds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      system_prompt TEXT,
      post_prompt TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE characters (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL REFERENCES characters(id),
      title TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    INSERT INTO worlds VALUES ('world-1', 'World', 'legacy prompt', 'legacy post', 1, 1);
    INSERT INTO characters VALUES ('character-1', 'world-1', 'Character', 0, 1, 1);
    INSERT INTO sessions VALUES ('session-1', 'character-1', 'Session', 1, 1);
    INSERT INTO messages VALUES ('message-1', 'session-1', 'user', 'Hello', 1);
  `);

  try {
    // guard-allow(tests): 连续执行两次，验证 initSchema 重复执行不出错
    initSchema(db);
    initSchema(db);

    const session = db.prepare(`
      SELECT id, character_id, world_id, mode, title FROM sessions WHERE id = ?
    `).get('session-1');
    assert.deepEqual(session, {
      id: 'session-1',
      character_id: 'character-1',
      world_id: null,
      mode: 'chat',
      title: 'Session',
    });
    assert.equal(db.prepare('SELECT content FROM messages WHERE id = ?').get('message-1').content, 'Hello');

    const sessionColumns = db.pragma('table_info(sessions)');
    assert.equal(sessionColumns.find((column) => column.name === 'character_id').notnull, 0);
    const sessionIndexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name IN ('idx_sessions_world_id', 'idx_sessions_character_id')
    `).all().map((index) => index.name).sort();
    assert.deepEqual(sessionIndexes, ['idx_sessions_character_id', 'idx_sessions_world_id']);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(db.inTransaction, false);

    const stateMemoryTables = [
      'state_entities', 'state_profile_fields', 'state_dynamic', 'state_relations',
      'state_threads', 'state_world_profile', 'state_world_facts', 'state_presence',
      'session_entity_state_values',
    ];
    const existingTables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table'`,
    ).all().map((row) => row.name);
    for (const table of stateMemoryTables) {
      assert.ok(existingTables.includes(table), `旧库升级后应存在状态记忆表 ${table}`);
    }
  } finally {
    db.close();
  }
});

test('initSchema 为新建的空库创建含 middle_summary / middle_covered_to 列的 turn_records、全部 9 张状态记忆表，且不创建旧上下文压缩结构', () => {
  const db = new Database(':memory:');
  try {
    initSchema(db);
    const columns = db.pragma('table_info(turn_records)').map((column) => column.name);
    assert.ok(columns.includes('middle_summary'));
    assert.ok(columns.includes('middle_covered_to'));
    assert.ok(!columns.includes('table_memory_snapshot'));

    assert.equal(
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_nearby_characters'`).get(),
      undefined,
    );
    assert.equal(
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_nearby_character_state_values'`).get(),
      undefined,
    );

    const stateMemoryTables = [
      'state_entities', 'state_profile_fields', 'state_dynamic', 'state_relations',
      'state_threads', 'state_world_profile', 'state_world_facts', 'state_presence',
      'session_entity_state_values',
    ];
    const existingTables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table'`,
    ).all().map((row) => row.name);
    for (const table of stateMemoryTables) {
      assert.ok(existingTables.includes(table), `新库应存在状态记忆表 ${table}`);
    }

    const messageColumns = db.pragma('table_info(messages)').map((column) => column.name);
    const sessionColumns = db.pragma('table_info(sessions)').map((column) => column.name);
    assert.ok(!messageColumns.includes('is_compressed'));
    assert.ok(!sessionColumns.includes('compressed_context'));
    assert.equal(
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_summaries'`).get(),
      undefined,
    );
    assert.equal(
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_messages_session_compressed'`).get(),
      undefined,
    );
  } finally {
    db.close();
  }
});

test('initSchema 迁移后清除旧库中残留的上下文压缩结构，并保留消息内容与顺序', () => {
  const db = new Database(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE worlds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE characters (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      character_id TEXT REFERENCES characters(id),
      world_id TEXT,
      mode TEXT NOT NULL DEFAULT 'chat',
      title TEXT,
      compressed_context TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      is_compressed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX idx_messages_session_compressed ON messages(session_id, is_compressed, created_at);
    CREATE TABLE session_summaries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    INSERT INTO worlds VALUES ('world-1', 'World', 1, 1);
    INSERT INTO characters VALUES ('character-1', 'world-1', 'Character', 0, 1, 1);
    INSERT INTO sessions (id, character_id, world_id, mode, title, compressed_context, created_at, updated_at)
      VALUES ('session-1', 'character-1', 'world-1', 'chat', 'Session', '旧压缩上下文', 1, 1);
    INSERT INTO messages (id, session_id, role, content, is_compressed, created_at)
      VALUES ('message-1', 'session-1', 'user', '第一条', 0, 1);
    INSERT INTO messages (id, session_id, role, content, is_compressed, created_at)
      VALUES ('message-2', 'session-1', 'assistant', '第二条', 1, 2);
    INSERT INTO session_summaries (id, session_id, content, created_at, updated_at)
      VALUES ('summary-1', 'session-1', '旧摘要', 1, 1);
  `);

  try {
    // guard-allow(tests): 连续执行两次，验证 initSchema 重复执行不出错
    initSchema(db);
    initSchema(db);

    const messageColumns = db.pragma('table_info(messages)').map((column) => column.name);
    const sessionColumns = db.pragma('table_info(sessions)').map((column) => column.name);
    assert.ok(!messageColumns.includes('is_compressed'));
    assert.ok(!sessionColumns.includes('compressed_context'));
    assert.equal(
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_summaries'`).get(),
      undefined,
    );
    assert.equal(
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_messages_session_compressed'`).get(),
      undefined,
    );

    const rows = db.prepare(
      'SELECT content FROM messages WHERE session_id = ? ORDER BY created_at ASC',
    ).all('session-1');
    assert.deepEqual(rows, [{ content: '第一条' }, { content: '第二条' }]);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(db.inTransaction, false);
  } finally {
    db.close();
  }
});

test('initSchema 为缺少 middle_summary / middle_covered_to 的旧 turn_records 表补齐两列且保留旧数据', () => {
  const db = new Database(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      character_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE turn_records (
      id                        TEXT PRIMARY KEY,
      session_id                TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      round_index                INTEGER NOT NULL,
      summary                    TEXT NOT NULL,
      scene                      TEXT,
      cast_json                  TEXT,
      user_message_id            TEXT,
      asst_message_id            TEXT,
      state_snapshot             TEXT,
      long_term_memory_snapshot  TEXT,
      table_memory_snapshot      TEXT,
      created_at                 INTEGER NOT NULL,
      UNIQUE(session_id, round_index)
    );
    INSERT INTO sessions VALUES ('session-1', NULL, 1, 1);
    INSERT INTO turn_records (id, session_id, round_index, summary, created_at)
      VALUES ('turn-1', 'session-1', 1, '旧摘要', 1);
  `);

  try {
    // guard-allow(tests): 连续执行两次，验证 initSchema 重复执行不出错
    initSchema(db);
    initSchema(db);

    const columns = db.pragma('table_info(turn_records)').map((column) => column.name);
    assert.ok(columns.includes('middle_summary'));
    assert.ok(columns.includes('middle_covered_to'));
    assert.ok(!columns.includes('long_term_memory_snapshot'));

    const row = db.prepare(
      'SELECT summary, middle_summary, middle_covered_to FROM turn_records WHERE id = ?',
    ).get('turn-1');
    assert.deepEqual(row, { summary: '旧摘要', middle_summary: null, middle_covered_to: null });
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(db.inTransaction, false);
  } finally {
    db.close();
  }
});
