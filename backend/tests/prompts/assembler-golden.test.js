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

// 会话与轮次时间必须固定：<expanded_dialogues> 渲染日期取自 turn_record.created_at，
// 走 fixture 默认的 Date.now() 会让金标快照每天都漂。取小于各用例 baseTs 的值，
// 保持「会话先于消息创建」的自然关系。
const SESSION_TS = 1;

const BASE_CONFIG = {
  global_system_prompt: 'GOLDEN 全局提示 {{world}}',
  global_post_prompt: 'GOLDEN 后置提示 {{char}}',
  memory_expansion_enabled: true,
  suggestion_enabled: true,
  writing: {
    global_system_prompt: 'GOLDEN 写作全局 {{world}}',
    global_post_prompt: 'GOLDEN 写作后置',
    suggestion_enabled: true,
    memory_expansion_enabled: true,
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

/**
 * 给会话铺：可召回的第 1 轮（旧）+ 中期摘要覆盖到第 1 轮、进入短期窗口的第 2 轮（最新 turn
 * record）+ 当前用户消息（第 3 轮，尚未生成 turn record）。
 */
function seedHistory(sessionId, slug, baseTs) {
  const recallUser = insertMessage(sandbox.db, sessionId, { role: 'user', content: '召回轮用户消息', created_at: baseTs + 1 });
  const recallAsst = insertMessage(sandbox.db, sessionId, { role: 'assistant', content: '召回轮助手消息', created_at: baseTs + 2 });
  insertTurnRecord(sandbox.db, sessionId, {
    id: `turn-old-${slug}`,
    round_index: 1,
    summary: '可召回的旧轮摘要',
    scene: '旧场景',
    cast_json: JSON.stringify(['旧角色']),
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
    middle_summary: '这是更早剧情的中期摘要正文',
    middle_covered_to: 1,
    created_at: baseTs + 6,
  });
  insertMessage(sandbox.db, sessionId, { role: 'user', content: '金标关键词 当前用户消息', created_at: baseTs + 7 });
}

test('buildPrompt / buildWritingPrompt 的输出逐字节稳定', async () => {
  const cases = {};

  const { buildPrompt, buildWritingPrompt } = await freshImport('backend/prompts/assembler.js');
  const { upsertEntity, upsertProfileField, upsertDynamicState, nextEntitySeq } = await freshImport('backend/db/queries/state-memory.js');

  /** 建一个置顶实体，保证无论会话内容如何都会被 selectRelevantEntities 选中，产出稳定的 <story_state> */
  function seedPinnedEntity(sessionId, { id, name, cardId = null, round = 1 }) {
    upsertEntity(sessionId, {
      entityId: id, seq: nextEntitySeq(sessionId), type: 'character', name, cardId, pinned: true,
    }, round);
  }

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
    const session = insertSession(sandbox.db, { id: 'sess-chat-base', created_at: SESSION_TS, character_id: character.id, world_id: world.id, title: '金标聊天会话' });
    seedHistory(session.id, 'chat-base', 1000);
    seedPinnedEntity(session.id, { id: 'entity-chat-base-main', name: '金标角色', cardId: character.id });
    seedPinnedEntity(session.id, { id: 'entity-chat-base-side', name: '金标配角' });
    upsertDynamicState(session.id, 'entity-chat-base-main', '位置', '旧港仓库', 1);
    upsertProfileField(session.id, 'entity-chat-base-side', 'occupation', '"码头搬运工"', '金标配角的职业设定', 1);

    sandbox.writeConfig(createTestConfig(BASE_CONFIG));
    process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([JSON.stringify({ turns: [1] })]);
    cases['1-chat-base'] = await buildPrompt(session.id, { diaryInjection: '金标日记内容', onRecallEvent() {} });

    resetMockEnv();
    process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([JSON.stringify({ turns: [1] })]);
    cases['2-chat-continuation'] = await buildPrompt(session.id, { continuation: true, onRecallEvent() {} });
  }

  // ── 3：chat 关掉 suggestion / 记忆展开，无日记 ──────────────────────
  {
    const world = buildWorld('chat-lean');
    const character = insertCharacter(sandbox.db, world.id, {
      id: 'char-chat-lean', name: '精简角色', system_prompt: '精简人设 {{char}}',
    });
    const session = insertSession(sandbox.db, { id: 'sess-chat-lean', created_at: SESSION_TS, character_id: character.id, world_id: world.id, title: '精简会话' });
    seedHistory(session.id, 'chat-lean', 2000);

    sandbox.writeConfig(createTestConfig({
      ...BASE_CONFIG,
      suggestion_enabled: false,
      memory_expansion_enabled: false,
    }));
    cases['3-chat-no-suggestion-no-expand'] = await buildPrompt(session.id, { onRecallEvent() {} });
  }

  // ── 4：chat 关记忆展开 + 状态记忆预算裁剪 ───────────────────────────
  {
    const world = buildWorld('chat-budget');
    const character = insertCharacter(sandbox.db, world.id, {
      id: 'char-chat-budget', name: '预算角色', system_prompt: '预算人设 {{char}}',
    });
    const session = insertSession(sandbox.db, { id: 'sess-chat-budget', created_at: SESSION_TS, character_id: character.id, world_id: world.id, title: '预算会话' });
    seedHistory(session.id, 'chat-budget', 3000);
    seedPinnedEntity(session.id, { id: 'entity-chat-budget-1', name: '预算甲' });
    upsertProfileField(session.id, 'entity-chat-budget-1', 'occupation', '"游走于各国之间的密探，身负多重使命，行踪飘忽不定"', '预算甲的职业设定', 1);
    seedPinnedEntity(session.id, { id: 'entity-chat-budget-2', name: '预算乙' });
    upsertProfileField(session.id, 'entity-chat-budget-2', 'occupation', '"隐居山林的铁匠，只为故人打造兵刃"', '预算乙的职业设定', 1);

    sandbox.writeConfig(createTestConfig({
      ...BASE_CONFIG,
      memory_expansion_enabled: false,
      state_injection_token_budget: 40,
    }));
    cases['4-chat-state-budget'] = await buildPrompt(session.id, { onRecallEvent() {} });
  }

  // ── 5：writing base ────────────────────────────────────────────────
  {
    const world = buildWorld('writing-base');
    const session = insertSession(sandbox.db, {
      id: 'sess-writing-base', created_at: SESSION_TS, world_id: world.id, mode: 'writing', title: '金标写作会话',
    });
    seedHistory(session.id, 'writing-base', 4000);
    seedPinnedEntity(session.id, { id: 'entity-writing-base-main', name: '写作主角' });
    upsertProfileField(session.id, 'entity-writing-base-main', 'occupation', '"流浪剑客"', '写作主角的职业设定', 1);

    sandbox.writeConfig(createTestConfig(BASE_CONFIG));
    process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([JSON.stringify({ turns: [1] })]);
    cases['5-writing-base'] = await buildWritingPrompt(session.id, { diaryInjection: '写作日记内容', onRecallEvent() {} });
  }

  // ── 6：writing 多实体状态记忆（多个在场角色）────────────────────────
  {
    const world = buildWorld('writing-multi');
    const session = insertSession(sandbox.db, {
      id: 'sess-writing-multi', created_at: SESSION_TS, world_id: world.id, mode: 'writing', title: '多实体会话',
    });
    seedHistory(session.id, 'writing-multi', 5000);

    seedPinnedEntity(session.id, { id: 'entity-writing-multi-1', name: '临时甲' });
    seedPinnedEntity(session.id, { id: 'entity-writing-multi-2', name: '临时乙' });
    seedPinnedEntity(session.id, { id: 'entity-writing-multi-3', name: '已存丙' });
    seedPinnedEntity(session.id, { id: 'entity-writing-multi-4', name: '已存丁' });
    upsertProfileField(session.id, 'entity-writing-multi-1', 'occupation', '"游侠"', '临时甲的职业设定', 1);
    upsertProfileField(session.id, 'entity-writing-multi-3', 'occupation', '"商人"', '已存丙的职业设定', 1);

    sandbox.writeConfig(createTestConfig({
      ...BASE_CONFIG,
      writing: { ...BASE_CONFIG.writing, memory_expansion_enabled: false },
    }));
    cases['6-writing-multi-entity'] = await buildWritingPrompt(session.id, { onRecallEvent() {} });
  }

  // ── 7：writing 非角色实体（地点/物品）状态记忆 ──────────────────────
  {
    const world = buildWorld('writing-nonchar');
    const session = insertSession(sandbox.db, {
      id: 'sess-writing-nonchar', created_at: SESSION_TS, world_id: world.id, mode: 'writing', title: '非角色实体会话',
    });
    seedHistory(session.id, 'writing-nonchar', 6000);

    upsertEntity(session.id, {
      entityId: 'entity-writing-nonchar-loc', seq: nextEntitySeq(session.id), type: 'location', name: '旧港仓库', pinned: true,
    }, 1);
    upsertEntity(session.id, {
      entityId: 'entity-writing-nonchar-item', seq: nextEntitySeq(session.id), type: 'item', name: '断刃', pinned: true,
    }, 1);
    upsertProfileField(session.id, 'entity-writing-nonchar-loc', 'description', '"废弃已久的码头仓库"', '仓库的概述', 1);
    upsertProfileField(session.id, 'entity-writing-nonchar-item', 'description', '"一柄缺了刃口的旧刀"', '断刃的概述', 1);

    sandbox.writeConfig(createTestConfig({
      ...BASE_CONFIG,
      writing: { ...BASE_CONFIG.writing, memory_expansion_enabled: false },
    }));
    cases['7-writing-non-character-entity'] = await buildWritingPrompt(session.id, { onRecallEvent() {} });
  }

  // ── 8：writing continuation + skipWritingInstructions ──────────────
  {
    const world = buildWorld('writing-cont');
    const session = insertSession(sandbox.db, {
      id: 'sess-writing-cont', created_at: SESSION_TS, world_id: world.id, mode: 'writing', title: '续写会话',
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

  // 守住快照的确定性：输出里一旦出现运行当天的日期，说明又有 Date.now() 派生值漏进
  // prompt（如会话/记录未固定 created_at），快照会每天漂一次。
  assert.ok(
    !actual.includes(new Date().toISOString().slice(0, 10)),
    'assembler 输出包含运行当天日期，说明有非确定性时间漏进 prompt',
  );

  if (process.env.WE_UPDATE_SNAPSHOTS === '1') {
    fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
    fs.writeFileSync(SNAPSHOT_PATH, actual, 'utf-8');
    return;
  }

  const expected = fs.readFileSync(SNAPSHOT_PATH, 'utf-8');
  assert.equal(actual, expected, 'assembler 输出发生字节变化，若非预期请勿更新快照');
});
