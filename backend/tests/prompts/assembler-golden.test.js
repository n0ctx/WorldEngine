/**
 * assembler-golden.test.js — buildPrompt / buildWritingPrompt 的逐字节全量快照
 *
 * 与 assembler-shape.test.js 的分工：
 *   shape  — 只抽锚点，守「段落顺序」
 *   golden — 不做抽取，守「输出字节」，是 prompt cache 命中的直接保障
 *
 * 再生成快照：WE_UPDATE_SNAPSHOTS=1 node --test tests/prompts/assembler-golden.test.js
 */
import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTestConfig, createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertCharacterStateField,
  insertCharacterStateValue,
  insertMessage,
  insertNearbyCharacter,
  insertNearbyStateValue,
  insertPersona,
  insertPersonaStateField,
  insertPersonaStateValue,
  insertSession,
  insertTurnRecord,
  insertWorld,
  insertWorldEntry,
  insertWorldStateField,
  insertWorldStateValue,
} from '../helpers/fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.join(__dirname, '__snapshots__', 'assembler-golden.snap');

const BASE_CONFIG = {
  provider_keys: { openai_compatible: 'test-key' },
  embedding: {
    provider: 'openai_compatible',
    provider_models: {},
    base_url: 'https://example.test/v1',
    model: 'embed-test',
  },
  global_system_prompt: 'GOLDEN 全局提示 {{world}}',
  global_post_prompt: 'GOLDEN 后置提示 {{char}}',
  context_history_rounds: 1,
  memory_expansion_enabled: true,
  suggestion_enabled: true,
  long_term_memory_enabled: false,
  table_memory_enabled: false,
  writing: {
    global_system_prompt: 'GOLDEN 写作全局 {{world}}',
    global_post_prompt: 'GOLDEN 写作后置',
    context_history_rounds: 1,
    suggestion_enabled: true,
    memory_expansion_enabled: true,
    long_term_memory_enabled: false,
    table_memory_enabled: false,
    llm: {
      provider: null,
      provider_models: {},
      base_url: '',
      model: 'golden-writer-model',
      temperature: 0.77,
      max_tokens: 640,
    },
    temperature: 0.77,
    max_tokens: 640,
    model: 'golden-writer-model',
  },
};

function withEmbeddingFetch(vector) {
  const originalFetch = global.fetch;
  global.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (url?.endsWith('/embeddings')) {
      return { ok: true, async json() { return { data: [{ embedding: vector }] }; } };
    }
    return originalFetch(input, init);
  };
  return () => { global.fetch = originalFetch; };
}

const sandbox = createTestSandbox('assembler-golden-suite', BASE_CONFIG);
sandbox.setEnv();

after(() => sandbox.cleanup());
afterEach(() => resetMockEnv());

/** 建一个字段/条目齐全的世界，id 全部固定以保证快照稳定 */
function buildWorld(slug) {
  const world = insertWorld(sandbox.db, {
    id: `world-${slug}`,
    name: `金标世界-${slug}`,
    temperature: 0.31,
    max_tokens: 420,
  });
  insertPersona(sandbox.db, world.id, {
    id: `persona-${slug}`,
    name: '金标玩家',
    system_prompt: '玩家人设 {{user}}',
  });
  insertWorldStateField(sandbox.db, world.id, { id: `wf-${slug}`, field_key: 'weather', label: '天气', sort_order: 0 });
  insertWorldStateValue(sandbox.db, world.id, { id: `wv-${slug}`, field_key: 'weather', default_value_json: '"晴朗"' });
  insertPersonaStateField(sandbox.db, world.id, { id: `pf-${slug}`, field_key: 'morale', label: '士气', sort_order: 0 });
  insertPersonaStateValue(sandbox.db, world.id, { id: `pv-${slug}`, field_key: 'morale', default_value_json: '"稳定"' });
  insertCharacterStateField(sandbox.db, world.id, { id: `cf-${slug}`, field_key: 'stance', label: '立场', sort_order: 0 });

  insertWorldEntry(sandbox.db, world.id, {
    id: `entry-cached-${slug}`,
    title: '常驻条目',
    content: '常驻条目正文 {{world}}',
    trigger_type: 'always',
    token: 0,
    sort_order: 0,
  });
  insertWorldEntry(sandbox.db, world.id, {
    id: `entry-kw-${slug}`,
    title: '关键词条目',
    content: '关键词条目正文 {{world}}',
    trigger_type: 'keyword',
    keywords: ['金标关键词'],
    keyword_scope: 'user',
    token: 2,
    sort_order: 1,
  });
  return world;
}

/** 给会话铺一轮可召回历史 + 一轮进入窗口的历史 + 当前用户消息 */
function seedHistory(sessionId, slug, baseTs) {
  const recallUser = insertMessage(sandbox.db, sessionId, { role: 'user', content: '召回轮用户消息', created_at: baseTs + 1 });
  const recallAsst = insertMessage(sandbox.db, sessionId, { role: 'assistant', content: '召回轮助手消息', created_at: baseTs + 2 });
  insertTurnRecord(sandbox.db, sessionId, {
    id: `turn-old-${slug}`,
    round_index: 1,
    summary: '可召回的旧轮摘要',
    user_message_id: recallUser.id,
    asst_message_id: recallAsst.id,
    created_at: baseTs + 3,
  });
  const histUser = insertMessage(sandbox.db, sessionId, { role: 'user', content: '旧轮用户消息', created_at: baseTs + 4 });
  const histAsst = insertMessage(sandbox.db, sessionId, { role: 'assistant', content: '旧轮助手消息', created_at: baseTs + 5 });
  insertTurnRecord(sandbox.db, sessionId, {
    id: `turn-recent-${slug}`,
    round_index: 2,
    summary: '最近一轮摘要',
    user_message_id: histUser.id,
    asst_message_id: histAsst.id,
    created_at: baseTs + 6,
  });
  insertMessage(sandbox.db, sessionId, { role: 'user', content: '金标关键词 当前用户消息', created_at: baseTs + 7 });
}

test('buildPrompt / buildWritingPrompt 的输出逐字节稳定', async () => {
  const restoreFetch = withEmbeddingFetch([1, 0, 0]);
  const cases = {};

  try {
    const { upsertEntry } = await freshImport('backend/utils/turn-summary-vector-store.js');
    const { buildPrompt, buildWritingPrompt } = await freshImport('backend/prompts/assembler.js');
    const { writeMemoryFile } = await freshImport('backend/services/long-term-memory.js');
    const { writeTables } = await freshImport('backend/services/table-memory.js');

    // ── 1 / 2：chat base 与 continuation（同一会话）────────────────────
    {
      const world = buildWorld('chat-base');
      const character = insertCharacter(sandbox.db, world.id, {
        id: 'char-chat-base',
        name: '金标角色',
        system_prompt: '角色人设 {{char}}',
        post_prompt: '角色后置 {{char}}',
      });
      insertCharacterStateValue(sandbox.db, character.id, { id: 'cv-chat-base', field_key: 'stance', default_value_json: '"守望"' });
      const session = insertSession(sandbox.db, { id: 'sess-chat-base', character_id: character.id, world_id: world.id, title: '金标聊天会话' });
      seedHistory(session.id, 'chat-base', 1000);
      upsertEntry('turn-old-chat-base', session.id, world.id, [1, 0, 0]);

      sandbox.writeConfig(createTestConfig(BASE_CONFIG));
      process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([JSON.stringify({ expand: ['turn-old-chat-base'] })]);
      cases['1-chat-base'] = await buildPrompt(session.id, { diaryInjection: '金标日记内容', onRecallEvent() {} });

      resetMockEnv();
      process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([JSON.stringify({ expand: ['turn-old-chat-base'] })]);
      cases['2-chat-continuation'] = await buildPrompt(session.id, { continuation: true, onRecallEvent() {} });
    }

    // ── 3：chat 关掉 suggestion / 记忆展开，无日记 ──────────────────────
    {
      const world = buildWorld('chat-lean');
      const character = insertCharacter(sandbox.db, world.id, {
        id: 'char-chat-lean', name: '精简角色', system_prompt: '精简人设 {{char}}',
      });
      const session = insertSession(sandbox.db, { id: 'sess-chat-lean', character_id: character.id, world_id: world.id, title: '精简会话' });
      seedHistory(session.id, 'chat-lean', 2000);
      upsertEntry('turn-old-chat-lean', session.id, world.id, [1, 0, 0]);

      sandbox.writeConfig(createTestConfig({
        ...BASE_CONFIG,
        suggestion_enabled: false,
        memory_expansion_enabled: false,
      }));
      cases['3-chat-no-suggestion-no-expand'] = await buildPrompt(session.id, { onRecallEvent() {} });
    }

    // ── 4：chat 开长期记忆 + 表格记忆 ──────────────────────────────────
    {
      const world = buildWorld('chat-memory');
      const character = insertCharacter(sandbox.db, world.id, {
        id: 'char-chat-memory', name: '记忆角色', system_prompt: '记忆人设 {{char}}',
      });
      const session = insertSession(sandbox.db, { id: 'sess-chat-memory', character_id: character.id, world_id: world.id, title: '记忆会话' });
      seedHistory(session.id, 'chat-memory', 3000);

      writeMemoryFile(session.id, '长期记忆正文第一行\n长期记忆正文第二行');
      writeTables(session.id, {
        tables: {
          relations: { rows: [{ id: 1, 主体A: '金标玩家', 主体B: '记忆角色', 关系类型: '同盟', '信任/敌意': '高信任' }], nextId: 2 },
          items: { rows: [{ id: 1, 物品: '断刃', '持有人/位置': '记忆角色', 状态: '完好' }], nextId: 2 },
          places: { rows: [], nextId: 1 },
          factions: { rows: [], nextId: 1 },
        },
        archive: {},
      });

      sandbox.writeConfig(createTestConfig({
        ...BASE_CONFIG,
        memory_expansion_enabled: false,
        long_term_memory_enabled: true,
        table_memory_enabled: true,
      }));
      cases['4-chat-ltm-and-table'] = await buildPrompt(session.id, { onRecallEvent() {} });
    }

    // ── 5：writing base ────────────────────────────────────────────────
    {
      const world = buildWorld('writing-base');
      const session = insertSession(sandbox.db, {
        id: 'sess-writing-base', world_id: world.id, mode: 'writing', title: '金标写作会话',
      });
      seedHistory(session.id, 'writing-base', 4000);
      upsertEntry('turn-old-writing-base', session.id, world.id, [1, 0, 0]);

      sandbox.writeConfig(createTestConfig(BASE_CONFIG));
      process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([JSON.stringify({ expand: ['turn-old-writing-base'] })]);
      cases['5-writing-base'] = await buildWritingPrompt(session.id, { diaryInjection: '写作日记内容', onRecallEvent() {} });
    }

    // ── 6：writing nearby，saved 不足阈值走 all-in ─────────────────────
    {
      const world = buildWorld('writing-allin');
      const session = insertSession(sandbox.db, {
        id: 'sess-writing-allin', world_id: world.id, mode: 'writing', title: '全量召回会话',
      });
      seedHistory(session.id, 'writing-allin', 5000);

      insertNearbyCharacter(sandbox.db, session.id, { id: 'nb-allin-t1', name: '临时甲', persona: '临时甲人设 {{char}}', is_saved: 0, created_at: 5010 });
      insertNearbyCharacter(sandbox.db, session.id, { id: 'nb-allin-t2', name: '临时乙', persona: '临时乙人设', is_saved: 0, created_at: 5011 });
      insertNearbyCharacter(sandbox.db, session.id, { id: 'nb-allin-s1', name: '已存丙', persona: '已存丙人设', is_saved: 1, created_at: 5012 });
      insertNearbyCharacter(sandbox.db, session.id, { id: 'nb-allin-s2', name: '已存丁', persona: '已存丁人设', is_saved: 1, created_at: 5013 });
      insertNearbyStateValue(sandbox.db, session.id, 'nb-allin-t1', { id: 'nv-allin-1', field_key: 'stance', runtime_value_json: '"戒备"' });
      insertNearbyStateValue(sandbox.db, session.id, 'nb-allin-s1', { id: 'nv-allin-2', field_key: 'stance', runtime_value_json: '"中立"' });

      sandbox.writeConfig(createTestConfig({
        ...BASE_CONFIG,
        writing: { ...BASE_CONFIG.writing, memory_expansion_enabled: false },
      }));
      cases['6-writing-nearby-all-in'] = await buildWritingPrompt(session.id, { onRecallEvent() {} });
    }

    // ── 7：writing nearby，saved 达阈值走 judge ────────────────────────
    {
      const world = buildWorld('writing-judge');
      const session = insertSession(sandbox.db, {
        id: 'sess-writing-judge', world_id: world.id, mode: 'writing', title: '判定召回会话',
      });
      seedHistory(session.id, 'writing-judge', 6000);

      insertNearbyCharacter(sandbox.db, session.id, { id: 'nb-judge-t1', name: '临时戊', persona: '临时戊人设', is_saved: 0, created_at: 6010 });
      for (let i = 1; i <= 5; i += 1) {
        insertNearbyCharacter(sandbox.db, session.id, {
          id: `nb-judge-s${i}`, name: `已存${i}号`, persona: `已存${i}号人设`, is_saved: 1, created_at: 6010 + i,
        });
      }
      insertNearbyStateValue(sandbox.db, session.id, 'nb-judge-s2', { id: 'nv-judge-1', field_key: 'stance', runtime_value_json: '"潜伏"' });

      sandbox.writeConfig(createTestConfig({
        ...BASE_CONFIG,
        writing: { ...BASE_CONFIG.writing, memory_expansion_enabled: false },
      }));
      process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([
        JSON.stringify({ recall: ['nb-judge-s2', 'nb-judge-s4'] }),
      ]);
      cases['7-writing-nearby-judge'] = await buildWritingPrompt(session.id, { onRecallEvent() {} });
    }

    // ── 8：writing continuation + skipWritingInstructions ──────────────
    {
      const world = buildWorld('writing-cont');
      const session = insertSession(sandbox.db, {
        id: 'sess-writing-cont', world_id: world.id, mode: 'writing', title: '续写会话',
      });
      seedHistory(session.id, 'writing-cont', 7000);

      sandbox.writeConfig(createTestConfig({
        ...BASE_CONFIG,
        writing: { ...BASE_CONFIG.writing, memory_expansion_enabled: false },
      }));
      cases['8-writing-continuation-skip-instructions'] = await buildWritingPrompt(session.id, {
        continuation: true,
        skipWritingInstructions: true,
        onRecallEvent() {},
      });
    }

    const actual = `${JSON.stringify(cases, null, 2)}\n`;

    if (process.env.WE_UPDATE_SNAPSHOTS === '1') {
      fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
      fs.writeFileSync(SNAPSHOT_PATH, actual, 'utf-8');
      return;
    }

    const expected = fs.readFileSync(SNAPSHOT_PATH, 'utf-8');
    assert.equal(actual, expected, 'assembler 输出发生字节变化，若非预期请勿更新快照');
  } finally {
    restoreFetch();
  }
});
