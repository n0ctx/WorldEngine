import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../../backend/tests/helpers/test-env.js';

const sandbox = createTestSandbox('assistant-agent-factory-suite');
sandbox.setEnv();

after(() => {
  sandbox.cleanup();
});

async function loadAgentFactory() {
  return freshImport('assistant/server/agent-factory.js');
}

function createSseRecorder() {
  const chunks = [];
  return {
    writableEnded: false,
    write(chunk) {
      chunks.push(chunk);
    },
    events() {
      return chunks
        .join('')
        .split('\n\n')
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => {
          const line = block.split('\n').find((item) => item.startsWith('data: '));
          return line ? JSON.parse(line.slice(6)) : null;
        })
        .filter(Boolean);
    },
  };
}

test('buildAgentMessages 会把 prompt 模板拆成 system + user 两段', async () => {
  const { __testables } = await loadAgentFactory();
  const messages = __testables.buildAgentMessages('world_card_agent', '请修改世界卡');

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.match(messages[1].content, /请修改世界卡/);
});

test('buildAgentMessages 在缺少 prompt 模板时抛出文件错误', async () => {
  const { __testables } = await loadAgentFactory();
  assert.throws(
    () => __testables.buildAgentMessages('missing_agent', '任务'),
    /ENOENT/,
  );
});

test('createAgentTool 会在首轮非 JSON 输出后重试并生成提案 token', async () => {
  const { createAgentTool } = await loadAgentFactory();
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([
    'not-json',
    JSON.stringify({
      explanation: '已整理世界卡',
      changes: { name: '新世界' },
    }),
  ]);

  const sse = createSseRecorder();
  const proposalStore = new Map();
  const tool = createAgentTool({
    name: 'world_card_agent',
    description: '世界卡代理',
    parameters: { type: 'object', properties: {} },
    proposalType: 'world-card',
  }, {
    res: sse,
    proposalStore,
    normalizeProposal: (raw, locked) => ({
      type: locked.type,
      operation: locked.operation,
      entityId: locked.entityId,
      explanation: raw.explanation,
      changes: raw.changes,
      entryOps: [],
      stateFieldOps: [],
    }),
    previewCardTool: {
      type: 'function',
      function: { name: 'preview_card' },
      execute: async () => 'preview',
    },
  });

  const result = await tool.execute({
    task: '请把世界改成新世界',
    operation: 'update',
    entityId: 'world-1',
  });

  assert.match(result, /\[world_card_agent\] 提案已生成/);
  assert.match(result, /name: 新世界/);
  assert.equal(proposalStore.size, 1);

  const events = sse.events();
  assert.equal(events[0].type, 'routing');
  assert.equal(events[1].type, 'proposal');
  assert.equal(events[1].proposal.changes.name, '新世界');
});

test('createAgentTool 在未知 proposal type 或创建异常时返回失败摘要并推送 error 事件', async () => {
  const { createAgentTool } = await loadAgentFactory();
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ changes: { name: '异常世界' } });

  const sse = createSseRecorder();
  const tool = createAgentTool({
    name: 'world_card_agent',
    description: '世界卡代理',
    parameters: { type: 'object', properties: {} },
    proposalType: 'unknown-type',
  }, {
    res: sse,
    proposalStore: new Map(),
    normalizeProposal: () => {
      throw new Error('未知的 proposal type');
    },
    previewCardTool: {
      type: 'function',
      function: { name: 'preview_card' },
      execute: async () => 'preview',
    },
  });

  const result = await tool.execute({
    task: '生成异常提案',
    operation: 'update',
  });

  assert.match(result, /执行失败：未知的 proposal type/);
  const events = sse.events();
  assert.equal(events[0].type, 'routing');
  assert.equal(events.at(-1).type, 'error');
  assert.equal(events.at(-1).error, '未知的 proposal type');
});
