/**
 * state-memory.js — 状态记忆多版本表的查询与写入
 *
 * 状态记忆用多版本行取代逐轮整份快照：每行带 valid_from_round / valid_to_round，
 * valid_to_round 为 NULL 表示当前有效。写入统一走 closeAndInsertRow：同一轮内的
 * 多次修改原地更新，跨轮修改则关闭旧行、插入新行，从而保留历史又不让数据线性膨胀。
 *
 * 对外接口：
 *   当前视图读取：
 *     listCurrentEntities(sessionId) → Array（含 retired，按 seq）
 *     getEntityDetails(sessionId, entityIds) → { [entityId]: { profile, dynamic } }
 *     listCurrentRelations(sessionId, entityIds?) → Array
 *     listActiveThreads(sessionId, entityIds?) → Array（status='active'）
 *     listThreads(sessionId) → Array（含已结束）
 *     listCurrentWorldFacts(sessionId) → Array
 *     getCurrentWorldProfile(sessionId) → { time, location, location_entity_id }
 *     getLatestPresence(sessionId) → { round_index, entity_ids } | null
 *     getWorldProfileAtRound(sessionId, key, round) → { value, location_entity_id } | null
 *   写入：
 *     upsertEntity / upsertProfileField / upsertDynamicState / upsertRelation /
 *     upsertThread / upsertWorldProfile / upsertWorldFact（均为 closeAndInsert 版本）
 *     closeDynamicState / closeRelation / closeWorldFact（关闭当前行，不插入新版本）
 *     upsertPresence(sessionId, round, entityIds)
 *   取号：nextEntitySeq / nextThreadSeq / nextRelationSeq / nextFactSeq(sessionId)
 *   回滚：rollbackStateMemory(sessionId, keptRounds)
 */

import crypto from 'node:crypto';
import db from '../index.js';
import { withSessionStateTransaction } from './session-state-batch.js';

const MULTI_VERSION_TABLES = [
  'state_entities',
  'state_profile_fields',
  'state_dynamic',
  'state_relations',
  'state_threads',
  'state_world_profile',
  'state_world_facts',
];

// ============================
// 内部：多版本写入 / 关闭
// ============================

/**
 * 按 matchColumns 定位当前有效行（valid_to_round IS NULL）：
 * - 命中且 valid_from_round 等于本轮：原地更新数据列；
 * - 命中但轮次不同：关闭旧行（valid_to_round = round）再插入新行；
 * - 未命中：直接插入新行。
 * row 需带上全部数据列（包括未变化的），因为插入新版本行时会整行重写。
 */
function closeAndInsertRow(table, dataColumns, matchColumns, row, round) {
  const matchWhere = matchColumns.map((column) => `${column} = ?`).join(' AND ');
  const matchValues = matchColumns.map((column) => row[column]);
  const existing = db.prepare(
    `SELECT row_id, valid_from_round FROM ${table} WHERE ${matchWhere} AND valid_to_round IS NULL`,
  ).get(...matchValues);

  if (existing && existing.valid_from_round === round) {
    const setClause = dataColumns.map((column) => `${column} = ?`).join(', ');
    db.prepare(`UPDATE ${table} SET ${setClause} WHERE row_id = ?`).run(
      ...dataColumns.map((column) => row[column]), existing.row_id,
    );
    return existing.row_id;
  }

  if (existing) {
    db.prepare(`UPDATE ${table} SET valid_to_round = ? WHERE row_id = ?`).run(round, existing.row_id);
  }

  const rowId = crypto.randomUUID();
  const insertColumns = ['row_id', ...dataColumns, 'valid_from_round', 'valid_to_round'];
  const placeholders = insertColumns.map(() => '?').join(', ');
  db.prepare(`INSERT INTO ${table} (${insertColumns.join(', ')}) VALUES (${placeholders})`).run(
    rowId, ...dataColumns.map((column) => row[column]), round, null,
  );
  return rowId;
}

/** 关闭 matchColumns 定位到的当前有效行，不插入新版本；未命中时返回 null。 */
function closeCurrentRow(table, matchColumns, matchValues, round) {
  const matchWhere = matchColumns.map((column) => `${column} = ?`).join(' AND ');
  const existing = db.prepare(
    `SELECT row_id FROM ${table} WHERE ${matchWhere} AND valid_to_round IS NULL`,
  ).get(...matchValues);
  if (!existing) return null;
  db.prepare(`UPDATE ${table} SET valid_to_round = ? WHERE row_id = ?`).run(round, existing.row_id);
  return existing.row_id;
}

// ============================
// 写入：state_entities
// ============================

export function upsertEntity(sessionId, entity, round) {
  return closeAndInsertRow(
    'state_entities',
    ['entity_id', 'session_id', 'seq', 'type', 'name', 'aliases_json', 'card_id', 'pinned', 'status'],
    ['session_id', 'entity_id'],
    {
      entity_id: entity.entityId,
      session_id: sessionId,
      seq: entity.seq,
      type: entity.type,
      name: entity.name,
      aliases_json: entity.aliasesJson ?? '[]',
      card_id: entity.cardId ?? null,
      pinned: entity.pinned ? 1 : 0,
      status: entity.status ?? 'active',
    },
    round,
  );
}

// ============================
// 写入：state_profile_fields
// ============================

export function upsertProfileField(sessionId, entityId, fieldKey, valueJson, evidence, round) {
  return closeAndInsertRow(
    'state_profile_fields',
    ['session_id', 'entity_id', 'field_key', 'value_json', 'evidence'],
    ['session_id', 'entity_id', 'field_key'],
    { session_id: sessionId, entity_id: entityId, field_key: fieldKey, value_json: valueJson, evidence: evidence ?? null },
    round,
  );
}

// ============================
// 写入：state_dynamic
// ============================

export function upsertDynamicState(sessionId, entityId, key, value, round) {
  return closeAndInsertRow(
    'state_dynamic',
    ['session_id', 'entity_id', 'key', 'value'],
    ['session_id', 'entity_id', 'key'],
    { session_id: sessionId, entity_id: entityId, key, value },
    round,
  );
}

export function closeDynamicState(sessionId, entityId, key, round) {
  return closeCurrentRow('state_dynamic', ['session_id', 'entity_id', 'key'], [sessionId, entityId, key], round);
}

// ============================
// 写入：state_relations
// ============================

export function upsertRelation(sessionId, relation, round) {
  return closeAndInsertRow(
    'state_relations',
    ['relation_id', 'session_id', 'seq', 'subject_id', 'predicate', 'object_id', 'object_value', 'note'],
    ['session_id', 'relation_id'],
    {
      relation_id: relation.relationId,
      session_id: sessionId,
      seq: relation.seq,
      subject_id: relation.subjectId,
      predicate: relation.predicate,
      object_id: relation.objectId ?? null,
      object_value: relation.objectValue ?? null,
      note: relation.note ?? '',
    },
    round,
  );
}

export function closeRelation(sessionId, relationId, round) {
  return closeCurrentRow('state_relations', ['session_id', 'relation_id'], [sessionId, relationId], round);
}

// ============================
// 写入：state_threads
// ============================

export function upsertThread(sessionId, thread, round) {
  return closeAndInsertRow(
    'state_threads',
    ['thread_id', 'session_id', 'seq', 'kind', 'participants_json', 'content', 'status', 'opened_round'],
    ['session_id', 'thread_id'],
    {
      thread_id: thread.threadId,
      session_id: sessionId,
      seq: thread.seq,
      kind: thread.kind,
      participants_json: thread.participantsJson ?? '[]',
      content: thread.content,
      status: thread.status ?? 'active',
      opened_round: thread.openedRound,
    },
    round,
  );
}

// ============================
// 写入：state_world_profile
// ============================

export function upsertWorldProfile(sessionId, key, value, locationEntityId, round) {
  return closeAndInsertRow(
    'state_world_profile',
    ['session_id', 'key', 'value', 'location_entity_id'],
    ['session_id', 'key'],
    { session_id: sessionId, key, value: value ?? null, location_entity_id: locationEntityId ?? null },
    round,
  );
}

// ============================
// 写入：state_world_facts
// ============================

export function upsertWorldFact(sessionId, fact, round) {
  return closeAndInsertRow(
    'state_world_facts',
    ['fact_id', 'session_id', 'seq', 'text', 'evidence'],
    ['session_id', 'fact_id'],
    {
      fact_id: fact.factId,
      session_id: sessionId,
      seq: fact.seq,
      text: fact.text,
      evidence: fact.evidence ?? null,
    },
    round,
  );
}

export function closeWorldFact(sessionId, factId, round) {
  return closeCurrentRow('state_world_facts', ['session_id', 'fact_id'], [sessionId, factId], round);
}

// ============================
// 写入：state_presence
// ============================

/** 覆盖写入某轮结束时的在场实体名单。 */
export function upsertPresence(sessionId, round, entityIds) {
  db.prepare(`
    INSERT INTO state_presence (session_id, round_index, entity_ids_json)
    VALUES (?, ?, ?)
    ON CONFLICT(session_id, round_index) DO UPDATE SET entity_ids_json = excluded.entity_ids_json
  `).run(sessionId, round, JSON.stringify(entityIds ?? []));
}

// ============================
// 取号
// ============================

function nextSeq(table, sessionId) {
  const row = db.prepare(`SELECT MAX(seq) AS maxSeq FROM ${table} WHERE session_id = ?`).get(sessionId);
  return (row?.maxSeq ?? 0) + 1;
}

export function nextEntitySeq(sessionId) {
  return nextSeq('state_entities', sessionId);
}

export function nextThreadSeq(sessionId) {
  return nextSeq('state_threads', sessionId);
}

export function nextRelationSeq(sessionId) {
  return nextSeq('state_relations', sessionId);
}

export function nextFactSeq(sessionId) {
  return nextSeq('state_world_facts', sessionId);
}

// ============================
// 当前视图读取
// ============================

/** 当前有效的全部实体（含 retired），按 seq 升序。 */
export function listCurrentEntities(sessionId) {
  return db.prepare(`
    SELECT * FROM state_entities WHERE session_id = ? AND valid_to_round IS NULL ORDER BY seq ASC
  `).all(sessionId);
}

/**
 * 指定实体的当前档案与动态状态。
 * @returns {{ [entityId: string]: { profile: Record<string, {value_json: string, evidence: string|null}>, dynamic: Record<string, string> } }}
 */
export function getEntityDetails(sessionId, entityIds) {
  const details = Object.fromEntries(entityIds.map((id) => [id, { profile: {}, dynamic: {} }]));
  if (entityIds.length === 0) return details;
  const placeholders = entityIds.map(() => '?').join(', ');

  const profileRows = db.prepare(`
    SELECT entity_id, field_key, value_json, evidence FROM state_profile_fields
    WHERE session_id = ? AND valid_to_round IS NULL AND entity_id IN (${placeholders})
  `).all(sessionId, ...entityIds);
  for (const row of profileRows) {
    details[row.entity_id].profile[row.field_key] = { value_json: row.value_json, evidence: row.evidence };
  }

  const dynamicRows = db.prepare(`
    SELECT entity_id, key, value FROM state_dynamic
    WHERE session_id = ? AND valid_to_round IS NULL AND entity_id IN (${placeholders})
  `).all(sessionId, ...entityIds);
  for (const row of dynamicRows) {
    details[row.entity_id].dynamic[row.key] = row.value;
  }

  return details;
}

/** 当前有效的关系；传入 entityIds 时只返回主体或客体在其中的关系。 */
export function listCurrentRelations(sessionId, entityIds) {
  const rows = db.prepare(`
    SELECT * FROM state_relations WHERE session_id = ? AND valid_to_round IS NULL ORDER BY seq ASC
  `).all(sessionId);
  if (!entityIds) return rows;
  const idSet = new Set(entityIds);
  return rows.filter((row) => idSet.has(row.subject_id) || (row.object_id && idSet.has(row.object_id)));
}

function currentThreadsByStatus(sessionId, status) {
  const rows = db.prepare(`
    SELECT * FROM state_threads WHERE session_id = ? AND valid_to_round IS NULL ORDER BY seq ASC
  `).all(sessionId);
  return status ? rows.filter((row) => row.status === status) : rows;
}

/** 进行中（status='active'）的事项；传入 entityIds 时只返回参与方交集非空的事项。 */
export function listActiveThreads(sessionId, entityIds) {
  const rows = currentThreadsByStatus(sessionId, 'active');
  if (!entityIds) return rows;
  const idSet = new Set(entityIds);
  return rows.filter((row) => {
    const participants = JSON.parse(row.participants_json || '[]');
    return participants.some((id) => idSet.has(id));
  });
}

/** 当前有效的全部事项（含已结束）。 */
export function listThreads(sessionId) {
  return currentThreadsByStatus(sessionId, null);
}

/** 当前有效的世界事实，按 seq 升序。 */
export function listCurrentWorldFacts(sessionId) {
  return db.prepare(`
    SELECT * FROM state_world_facts WHERE session_id = ? AND valid_to_round IS NULL ORDER BY seq ASC
  `).all(sessionId);
}

/** 当前世界档案（时间、地点）。 */
export function getCurrentWorldProfile(sessionId) {
  const rows = db.prepare(`
    SELECT key, value, location_entity_id FROM state_world_profile
    WHERE session_id = ? AND valid_to_round IS NULL
  `).all(sessionId);
  const profile = { time: null, location: null, location_entity_id: null };
  for (const row of rows) {
    if (row.key === 'time') profile.time = row.value;
    if (row.key === 'location') {
      profile.location = row.value;
      profile.location_entity_id = row.location_entity_id;
    }
  }
  return profile;
}

/** 最近一轮的在场名单；没有记录时返回 null。 */
export function getLatestPresence(sessionId) {
  const row = db.prepare(`
    SELECT round_index, entity_ids_json FROM state_presence
    WHERE session_id = ? ORDER BY round_index DESC LIMIT 1
  `).get(sessionId);
  if (!row) return null;
  return { round_index: row.round_index, entity_ids: JSON.parse(row.entity_ids_json || '[]') };
}

/** 第 R 轮时某个世界档案键的值（用于日记按轮取历史时间等场景）。 */
export function getWorldProfileAtRound(sessionId, key, round) {
  const row = db.prepare(`
    SELECT value, location_entity_id FROM state_world_profile
    WHERE session_id = ? AND key = ? AND valid_from_round <= ?
      AND (valid_to_round IS NULL OR valid_to_round > ?)
  `).get(sessionId, key, round, round);
  return row ?? null;
}

// ============================
// 回滚
// ============================

/**
 * 回滚状态记忆到第 keptRounds 轮之后的状态：
 * - 各多版本表：删除 valid_from_round > K 的行，再把 valid_to_round > K 的行恢复为当前有效；
 * - state_presence：删除 round_index > K 的行；
 * - session_entity_state_values：删除已不在 state_entities 中的实体的值。
 * 整体包在一个事务里。
 */
export function rollbackStateMemory(sessionId, keptRounds) {
  return withSessionStateTransaction(() => {
    // guard-allow(perf-shape): 按固定的多版本表清单（7 张）逐表执行两条语句，表数量固定不随数据量增长
    for (const table of MULTI_VERSION_TABLES) {
      db.prepare(`DELETE FROM ${table} WHERE session_id = ? AND valid_from_round > ?`).run(sessionId, keptRounds);
      db.prepare(`UPDATE ${table} SET valid_to_round = NULL WHERE session_id = ? AND valid_to_round > ?`)
        .run(sessionId, keptRounds);
    }
    db.prepare(`DELETE FROM state_presence WHERE session_id = ? AND round_index > ?`).run(sessionId, keptRounds);

    const remainingEntityIds = db.prepare(`SELECT DISTINCT entity_id FROM state_entities WHERE session_id = ?`)
      .all(sessionId).map((row) => row.entity_id);
    if (remainingEntityIds.length === 0) {
      db.prepare(`DELETE FROM session_entity_state_values WHERE session_id = ?`).run(sessionId);
    } else {
      const placeholders = remainingEntityIds.map(() => '?').join(', ');
      db.prepare(
        `DELETE FROM session_entity_state_values WHERE session_id = ? AND entity_id NOT IN (${placeholders})`,
      ).run(sessionId, ...remainingEntityIds);
    }
  });
}
