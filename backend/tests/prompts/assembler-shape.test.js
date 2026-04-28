import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
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

function withEmbeddingFetch(vector) {
  const originalFetch = global.fetch;
  global.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (url?.endsWith('/embeddings')) {
      return {
        ok: true,
        async json() {
          return { data: [{ embedding: vector }] };
        },
      };
    }
    return originalFetch(input, init);
  };
  return () => {
    global.fetch = originalFetch;
  };
}

afterEach(() => {
  resetMockEnv();
});

test('buildPrompt / buildWritingPrompt 的结构锚点顺序保持稳定', async () => {
  const sandbox = createTestSandbox('assembler-shape-suite', {
    embedding: {
      provider: 'openai_compatible',
      provider_keys: { openai_compatible: 'test-key' },
      provider_models: {},
      base_url: 'https://example.test/v1',
      model: 'embed-test',
    },
    global_system_prompt: 'ANCHOR_[1]_CHAT_GLOBAL {{world}}',
    global_post_prompt: 'ANCHOR_[11]_CHAT_POST {{char}}',
    context_history_rounds: 1,
    memory_expansion_enabled: true,
    suggestion_enabled: true,
    writing: {
      global_system_prompt: 'ANCHOR_[1]_WRITING_GLOBAL {{world}}/{{char}}',
      global_post_prompt: 'ANCHOR_[11]_WRITING_POST {{char}}',
      context_history_rounds: 1,
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
  });
  sandbox.setEnv();

  const restoreFetch = withEmbeddingFetch([1, 0, 0]);
  try {
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

    const chatSession = insertSession(sandbox.db, {
      character_id: alpha.id,
      title: '聊天会话',
    });
    const recallUser = insertMessage(sandbox.db, chatSession.id, {
      role: 'user',
      content: '召回轮用户消息',
      created_at: 1,
    });
    const recallAssistant = insertMessage(sandbox.db, chatSession.id, {
      role: 'assistant',
      content: '召回轮助手消息',
      created_at: 2,
    });
    insertTurnRecord(sandbox.db, chatSession.id, {
      id: 'turn-old-chat',
      round_index: 1,
      summary: 'ANCHOR_[8]_RECALL_CHAT',
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
    sandbox.db.prepare(`
      INSERT INTO writing_session_characters (id, session_id, character_id, created_at)
      VALUES ('w-alpha', ?, ?, 1), ('w-beta', ?, ?, 2)
    `).run(writingSession.id, alpha.id, writingSession.id, beta.id);
    const writingRecallUser = insertMessage(sandbox.db, writingSession.id, {
      role: 'user',
      content: '召回写作用户消息',
      created_at: 10,
    });
    const writingRecallAssistant = insertMessage(sandbox.db, writingSession.id, {
      role: 'assistant',
      content: '召回写作助手消息',
      created_at: 11,
    });
    insertTurnRecord(sandbox.db, writingSession.id, {
      id: 'turn-old-writing',
      round_index: 1,
      summary: 'ANCHOR_[8]_RECALL_WRITING',
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
      created_at: 15,
    });
    insertMessage(sandbox.db, writingSession.id, {
      role: 'user',
      content: 'ANCHOR_QUERY 当前写作消息',
      created_at: 16,
    });

    const { upsertEntry } = await freshImport('backend/utils/turn-summary-vector-store.js');
    upsertEntry('turn-old-chat', chatSession.id, world.id, [1, 0, 0]);
    upsertEntry('turn-old-writing', writingSession.id, world.id, [1, 0, 0]);

    process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([
      JSON.stringify({ expand: ['turn-old-chat'] }),
      JSON.stringify({ expand: ['turn-old-writing'] }),
    ]);

    const { buildPrompt, buildWritingPrompt } = await freshImport('backend/prompts/assembler.js');
    const chatResult = await buildPrompt(chatSession.id, {
      diaryInjection: 'ANCHOR_[10]_DIARY_CHAT',
      onRecallEvent() {},
    });
    const writingResult = await buildWritingPrompt(writingSession.id, {
      diaryInjection: 'ANCHOR_[10]_DIARY_WRITING',
      onRecallEvent() {},
    });

    const shape = {
      chat: {
        temperature: chatResult.temperature,
        maxTokens: chatResult.maxTokens,
        recallHitCount: chatResult.recallHitCount,
        messages: extractMessageShape(chatResult.messages, {
          0: ['ANCHOR_[1]_CHAT_GLOBAL', 'ANCHOR_[2]_PERSONA', 'ANCHOR_[3]_CHAR_ALPHA', 'ANCHOR_[3.5]_CACHED_TITLE', 'ANCHOR_[3.5]_CACHED_BODY'],
          1: ['旧轮用户消息'],
          2: ['旧轮助手消息'],
          3: [
            'ANCHOR_[4]_WORLD_STATE', 'ANCHOR_[5]_PERSONA_STATE', 'ANCHOR_[6]_CHAR_STATE',
            'ANCHOR_[7]_ENTRY_TITLE', 'ANCHOR_[7]_ENTRY_BODY',
            '[历史记忆召回]', 'ANCHOR_[8]_RECALL_CHAT',
            '[历史对话原文展开]', 'ANCHOR_[10]_DIARY_CHAT',
            '<user_message>', 'ANCHOR_QUERY 当前聊天消息', '</user_message>',
            'next_prompt', 'ANCHOR_[11]_CHAT_POST', 'ANCHOR_[11]_CHAR_POST',
          ],
        }),
      },
      writing: {
        temperature: writingResult.temperature,
        maxTokens: writingResult.maxTokens,
        model: writingResult.model,
        recallHitCount: writingResult.recallHitCount,
        messages: extractMessageShape(writingResult.messages, {
          0: ['ANCHOR_[1]_WRITING_GLOBAL', 'ANCHOR_[2]_PERSONA', 'ANCHOR_[3.5]_CACHED_TITLE', 'ANCHOR_[3.5]_CACHED_BODY'],
          1: ['旧写作用户消息'],
          2: ['旧写作助手消息'],
          3: [
            'ANCHOR_[3]_CHAR_ALPHA', 'ANCHOR_[3]_CHAR_BETA',
            'ANCHOR_[4]_WORLD_STATE', 'ANCHOR_[5]_PERSONA_STATE', 'ANCHOR_[6]_CHAR_STATE',
            'ANCHOR_[7]_ENTRY_TITLE', 'ANCHOR_[7]_ENTRY_BODY',
            '[历史记忆召回]', 'ANCHOR_[8]_RECALL_WRITING',
            '[历史对话原文展开]', 'ANCHOR_[10]_DIARY_WRITING',
            '<user_message>', 'ANCHOR_QUERY 当前写作消息', '</user_message>',
            'next_prompt', 'ANCHOR_[11]_WRITING_POST',
          ],
        }),
      },
    };

    const expected = fs.readFileSync(SNAPSHOT_PATH, 'utf-8');
    assert.equal(snapshotShape(shape), expected);
  } finally {
    restoreFetch();
    sandbox.cleanup();
  }
});
