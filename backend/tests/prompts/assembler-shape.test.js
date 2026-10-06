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
const SNAPSHOT_PATH = path.join(__dirname, '__snapshots__', 'assembler-shape.snap');

function snapshotShape(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function extractAnchors(content, anchors) {
  const positions = anchors
    .map((anchor) => ({ anchor, index: content.indexOf(anchor) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);
  return {
    orderedAnchors: positions.map((item) => item.anchor),
    missingAnchors: anchors.filter((anchor) => content.indexOf(anchor) < 0),
  };
}

function extractMessageShape(messages, anchorMap) {
  return messages.map((message, index) => ({
    index,
    role: message.role,
    ...extractAnchors(String(message.content ?? ''), anchorMap[index] ?? []),
  }));
}

const SHAPE_CONFIG_PATCH = {
  global_system_prompt: 'ANCHOR_[1]_CHAT_GLOBAL {{world}}',
  global_post_prompt: 'ANCHOR_[11]_CHAT_POST {{char}}',
  memory_expansion_enabled: true,
  suggestion_enabled: true,
  writing: {
    global_system_prompt: 'ANCHOR_[1]_WRITING_GLOBAL {{world}}/{{char}}',
    global_post_prompt: 'ANCHOR_[11]_WRITING_POST {{char}}',
    suggestion_enabled: true,
    memory_expansion_enabled: true,
    llm: {
      provider: null,
      provider_models: {},
      base_url: '',
      model: 'writer-shape-model',
      temperature: 0.88,
      max_tokens: 555,
    },
    temperature: 0.88,
    max_tokens: 555,
    model: 'writer-shape-model',
  },
};

const sandbox = createTestSandbox('assembler-shape-suite', SHAPE_CONFIG_PATCH);
sandbox.setEnv();

after(() => {
  sandbox.cleanup();
});

afterEach(() => {
  resetMockEnv();
});

test('buildPrompt / buildWritingPrompt 的结构锚点顺序保持稳定', async () => {
  sandbox.writeConfig(createTestConfig(SHAPE_CONFIG_PATCH));

  const world = insertWorld(sandbox.db, {
    name: '锚点世界',
    temperature: 0.33,
    max_tokens: 444,
  });
  insertPersona(sandbox.db, world.id, {
    name: '锚点玩家',
    system_prompt: 'ANCHOR_[2]_PERSONA {{user}}',
  });

  insertWorldStateField(sandbox.db, world.id, {
    field_key: 'weather',
    label: 'ANCHOR_[4]_WORLD_STATE',
    sort_order: 0,
  });
  insertWorldStateValue(sandbox.db, world.id, {
    field_key: 'weather',
    default_value_json: '"晴朗"',
  });
  insertPersonaStateField(sandbox.db, world.id, {
    field_key: 'morale',
    label: 'ANCHOR_[5]_PERSONA_STATE',
    sort_order: 0,
  });
  insertPersonaStateValue(sandbox.db, world.id, {
    field_key: 'morale',
    default_value_json: '"稳定"',
  });
  insertCharacterStateField(sandbox.db, world.id, {
    field_key: 'stance',
    label: 'ANCHOR_[6]_CHAR_STATE',
    sort_order: 0,
  });

  const alpha = insertCharacter(sandbox.db, world.id, {
    name: '阿尔法',
    system_prompt: 'ANCHOR_[3]_CHAR_ALPHA {{char}}',
    post_prompt: 'ANCHOR_[11]_CHAR_POST {{char}}',
    first_message: '开场白',
  });
  const beta = insertCharacter(sandbox.db, world.id, {
    name: '贝塔',
    system_prompt: 'ANCHOR_[3]_CHAR_BETA {{char}}',
  });
  insertCharacterStateValue(sandbox.db, alpha.id, {
    field_key: 'stance',
    default_value_json: '"守望"',
  });
  insertCharacterStateValue(sandbox.db, beta.id, {
    field_key: 'stance',
    default_value_json: '"游离"',
  });

  insertWorldEntry(sandbox.db, world.id, {
    title: 'ANCHOR_[3.5]_CACHED_TITLE',
    content: 'ANCHOR_[3.5]_CACHED_BODY {{world}}',
    trigger_type: 'always',
    token: 0,
    sort_order: 0,
  });
  insertWorldEntry(sandbox.db, world.id, {
    title: 'ANCHOR_[7]_ENTRY_TITLE',
    content: 'ANCHOR_[7]_ENTRY_BODY {{world}}',
    trigger_type: 'keyword',
    keywords: ['ANCHOR_QUERY'],
    keyword_scope: 'user',
    token: 2,
    sort_order: 1,
  });

  // 每个会话铺：可召回的第 1 轮（原文进 <expanded_dialogues>）+ 中期摘要覆盖到第 1 轮、
  // 进入短期窗口的第 2 轮（最新 turn record，携带 middle_summary）+ 当前用户消息。
  const chatSession = insertSession(sandbox.db, {
    character_id: alpha.id,
    title: '聊天会话',
  });
  const recallUser = insertMessage(sandbox.db, chatSession.id, {
    role: 'user',
    content: 'ANCHOR_[10]_RECALL_CHAT_USER',
    created_at: 1,
  });
  const recallAssistant = insertMessage(sandbox.db, chatSession.id, {
    role: 'assistant',
    content: 'ANCHOR_[10]_RECALL_CHAT_ASST',
    created_at: 2,
  });
  insertTurnRecord(sandbox.db, chatSession.id, {
    id: 'turn-old-chat',
    round_index: 1,
    summary: '可召回的旧轮摘要',
    user_message_id: recallUser.id,
    asst_message_id: recallAssistant.id,
    created_at: 3,
  });
  const historyUser = insertMessage(sandbox.db, chatSession.id, {
    role: 'user',
    content: '旧轮用户消息',
    created_at: 4,
  });
  const historyAssistant = insertMessage(sandbox.db, chatSession.id, {
    role: 'assistant',
    content: '旧轮助手消息',
    created_at: 5,
  });
  insertTurnRecord(sandbox.db, chatSession.id, {
    id: 'turn-history-chat',
    round_index: 2,
    summary: '最近聊天摘要',
    user_message_id: historyUser.id,
    asst_message_id: historyAssistant.id,
    middle_summary: 'ANCHOR_[8.5]_STORY_CHAT',
    middle_covered_to: 1,
    created_at: 6,
  });
  insertMessage(sandbox.db, chatSession.id, {
    role: 'user',
    content: 'ANCHOR_QUERY 当前聊天消息',
    created_at: 7,
  });

  const writingSession = insertSession(sandbox.db, {
    world_id: world.id,
    mode: 'writing',
    title: '写作会话',
  });
  // 写作模式没有固定角色身份；不再向 writing_session_characters 插行
  const writingRecallUser = insertMessage(sandbox.db, writingSession.id, {
    role: 'user',
    content: 'ANCHOR_[10]_RECALL_WRITING_USER',
    created_at: 10,
  });
  const writingRecallAssistant = insertMessage(sandbox.db, writingSession.id, {
    role: 'assistant',
    content: 'ANCHOR_[10]_RECALL_WRITING_ASST',
    created_at: 11,
  });
  insertTurnRecord(sandbox.db, writingSession.id, {
    id: 'turn-old-writing',
    round_index: 1,
    summary: '可召回的旧写作摘要',
    user_message_id: writingRecallUser.id,
    asst_message_id: writingRecallAssistant.id,
    created_at: 12,
  });
  const writingHistoryUser = insertMessage(sandbox.db, writingSession.id, {
    role: 'user',
    content: '旧写作用户消息',
    created_at: 13,
  });
  const writingHistoryAssistant = insertMessage(sandbox.db, writingSession.id, {
    role: 'assistant',
    content: '旧写作助手消息',
    created_at: 14,
  });
  insertTurnRecord(sandbox.db, writingSession.id, {
    id: 'turn-history-writing',
    round_index: 2,
    summary: '最近写作摘要',
    user_message_id: writingHistoryUser.id,
    asst_message_id: writingHistoryAssistant.id,
    middle_summary: 'ANCHOR_[8.5]_STORY_WRITING',
    middle_covered_to: 1,
    created_at: 15,
  });
  insertMessage(sandbox.db, writingSession.id, {
    role: 'user',
    content: 'ANCHOR_QUERY 当前写作消息',
    created_at: 16,
  });

  const { upsertEntity, nextEntitySeq } = await freshImport('backend/db/queries/state-memory.js');
  upsertEntity(chatSession.id, {
    entityId: 'entity-shape-chat', seq: nextEntitySeq(chatSession.id), type: 'item', name: 'ANCHOR_[6.5]_STORY_STATE_CHAT', pinned: true,
  }, 1);
  upsertEntity(writingSession.id, {
    entityId: 'entity-shape-writing', seq: nextEntitySeq(writingSession.id), type: 'item', name: 'ANCHOR_[6.5]_STORY_STATE_WRITING', pinned: true,
  }, 1);

  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([
    JSON.stringify({ turns: [1] }),
    JSON.stringify({ turns: [1] }),
  ]);

  const { buildPrompt, buildWritingPrompt } = await freshImport('backend/prompts/assembler.js');
  const chatResult = await buildPrompt(chatSession.id, {
    diaryInjection: 'ANCHOR_[11]_DIARY_CHAT',
    onRecallEvent() {},
  });
  const writingResult = await buildWritingPrompt(writingSession.id, {
    diaryInjection: 'ANCHOR_[11]_DIARY_WRITING',
    onRecallEvent() {},
  });

  const shape = {
    chat: {
      temperature: chatResult.temperature,
      maxTokens: chatResult.maxTokens,
      recallHitCount: chatResult.recallHitCount,
      messages: extractMessageShape(chatResult.messages, {
        0: [
          'ANCHOR_[1]_CHAT_GLOBAL', 'ANCHOR_[3.5]_CACHED_TITLE', 'ANCHOR_[3.5]_CACHED_BODY', 'ANCHOR_[2]_PERSONA', 'ANCHOR_[3]_CHAR_ALPHA',
          '<context_guide>', 'ANCHOR_[8.5]_STORY_CHAT',
        ],
        1: ['旧轮用户消息'],
        2: ['旧轮助手消息'],
        3: [
          'ANCHOR_[4]_WORLD_STATE', 'ANCHOR_[5]_PERSONA_STATE', 'ANCHOR_[6]_CHAR_STATE', 'ANCHOR_[6.5]_STORY_STATE_CHAT', 'ANCHOR_[7]_ENTRY_TITLE', 'ANCHOR_[7]_ENTRY_BODY',
          '<expanded_dialogues>', 'ANCHOR_[10]_RECALL_CHAT_USER', 'ANCHOR_[10]_RECALL_CHAT_ASST', 'ANCHOR_[11]_DIARY_CHAT',
          '<user_input>', 'ANCHOR_QUERY 当前聊天消息', 'ANCHOR_[11]_CHAT_POST', 'ANCHOR_[11]_CHAR_POST', 'next_prompt',
        ],
      }),
    },
    writing: {
      temperature: writingResult.temperature,
      maxTokens: writingResult.maxTokens,
      model: writingResult.model,
      recallHitCount: writingResult.recallHitCount,
      messages: extractMessageShape(writingResult.messages, {
        // 写作模式不注入 [3] 角色 system_prompt / [6] 角色状态段
        0: [
          'ANCHOR_[1]_WRITING_GLOBAL', 'ANCHOR_[3.5]_CACHED_TITLE', 'ANCHOR_[3.5]_CACHED_BODY', 'ANCHOR_[2]_PERSONA',
          '<context_guide>', 'ANCHOR_[8.5]_STORY_WRITING',
        ],
        1: ['旧写作用户消息'],
        2: ['旧写作助手消息'],
        3: [
          'ANCHOR_[4]_WORLD_STATE', 'ANCHOR_[5]_PERSONA_STATE', 'ANCHOR_[6.5]_STORY_STATE_WRITING',
          'ANCHOR_[7]_ENTRY_TITLE', 'ANCHOR_[7]_ENTRY_BODY', '<expanded_dialogues>', 'ANCHOR_[10]_RECALL_WRITING_USER', 'ANCHOR_[10]_RECALL_WRITING_ASST', 'ANCHOR_[11]_DIARY_WRITING',
          '<user_input>', 'ANCHOR_QUERY 当前写作消息', 'ANCHOR_[11]_WRITING_POST', 'next_prompt',
        ],
      }),
    },
  };

  if (process.env.WE_UPDATE_SNAPSHOTS === '1') {
    fs.writeFileSync(SNAPSHOT_PATH, snapshotShape(shape), 'utf-8');
    return;
  }
  const expected = fs.readFileSync(SNAPSHOT_PATH, 'utf-8');
  assert.equal(snapshotShape(shape), expected);
});

test('buildPrompt messages[0]（CACHED LAYER）在同一会话内跨轮次保持内容不变', async () => {
  sandbox.writeConfig(createTestConfig({
    global_system_prompt: 'STABLE_GLOBAL {{world}}',
  }));

  const world = insertWorld(sandbox.db, { name: '稳定世界' });
  insertPersona(sandbox.db, world.id, { name: '稳定玩家', system_prompt: 'STABLE_PERSONA {{user}}' });
  const character = insertCharacter(sandbox.db, world.id, {
    name: '稳定角色',
    system_prompt: 'STABLE_CHAR {{char}}',
  });
  insertWorldEntry(sandbox.db, world.id, {
    title: 'STABLE_ENTRY_TITLE',
    content: 'STABLE_ENTRY_BODY {{world}}',
    trigger_type: 'always',
    token: 0,
    sort_order: 0,
  });

  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第一轮用户消息', created_at: 1 });

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');

  // 第一次调用
  const result1 = await buildPrompt(session.id, { onRecallEvent() {} });
  const cached0_first = result1.messages[0];
  assert.equal(cached0_first.role, 'system', 'messages[0] 必须是 system role');

  // 插入新消息，模拟对话推进
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '第一轮 AI 回复', created_at: 2 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第二轮用户消息', created_at: 3 });

  // 第二次调用（第二轮）
  const result2 = await buildPrompt(session.id, { onRecallEvent() {} });
  const cached0_second = result2.messages[0];
  assert.equal(cached0_second.role, 'system', 'messages[0] 第二轮仍须是 system role');

  // CACHED LAYER 内容必须完全相同，保证 prefix cache 可命中
  assert.equal(
    cached0_second.content,
    cached0_first.content,
    'CACHED LAYER（messages[0].content）在跨轮次之间必须保持逐字节一致，否则 provider prefix cache 无法命中',
  );
});

test('buildPrompt「system + 历史」前缀跨轮逐字一致，每轮变化的上下文只出现在末尾 user', async () => {
  sandbox.writeConfig(createTestConfig({
    global_system_prompt: 'PREFIX_GLOBAL {{world}}',
  }));

  const world = insertWorld(sandbox.db, { name: '前缀世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '前缀角色', system_prompt: 'PREFIX_CHAR {{char}}' });
  insertWorldEntry(sandbox.db, world.id, {
    title: 'TURN_ENTRY_TITLE',
    content: 'TURN_ENTRY_BODY',
    keywords: ['第三轮'],
    keyword_scope: 'user',
  });

  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第一轮用户消息', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '第一轮 AI 回复', created_at: 2 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第二轮用户消息', created_at: 3 });

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const result1 = await buildPrompt(session.id, { onRecallEvent() {} });

  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '第二轮 AI 回复', created_at: 4 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第三轮用户消息', created_at: 5 });
  const result2 = await buildPrompt(session.id, { onRecallEvent() {} });

  // 上一轮除末尾 user 外的全部消息，原样是下一轮的前缀
  const sharedPrefix = result1.messages.slice(0, -1);
  assert.deepEqual(result2.messages.slice(0, sharedPrefix.length), sharedPrefix);
  assert.equal(result2.messages[0].content, result2.cacheableSystem);
  assert.equal(result2.messages[3].content, '第二轮用户消息');

  // 本轮才触发的条目只在末尾 user，排在用户消息之前
  for (const message of result2.messages.slice(0, -1)) {
    assert.doesNotMatch(message.content, /TURN_ENTRY_BODY/);
  }
  assert.match(result2.messages.at(-1).content, /^<world_entries>[\s\S]*TURN_ENTRY_BODY[\s\S]*第三轮用户消息/);
});

test('buildPrompt 续写模式把本轮上下文加在被续写那轮的 user 上，末尾仍是待续写的 assistant', async () => {
  sandbox.writeConfig(createTestConfig({ global_system_prompt: 'CONT_GLOBAL' }));

  const world = insertWorld(sandbox.db, { name: '续写世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '续写角色' });
  insertWorldEntry(sandbox.db, world.id, {
    title: 'CONT_ENTRY_TITLE',
    content: 'CONT_ENTRY_BODY',
    trigger_type: 'always',
  });

  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '续写前的提问', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '写到一半的回答', created_at: 2 });

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const result = await buildPrompt(session.id, { continuation: true, onRecallEvent() {} });

  assert.deepEqual(result.messages.map((m) => m.role), ['system', 'user', 'assistant']);
  assert.match(result.messages[1].content, /^<world_entries>[\s\S]*CONT_ENTRY_BODY[\s\S]*续写前的提问$/);
  assert.equal(result.messages[2].content, '写到一半的回答');
});
