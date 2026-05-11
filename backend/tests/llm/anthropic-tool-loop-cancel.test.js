import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveToolContextAnthropic } from '../../llm/providers/anthropic/index.js';
import { ToolLoopCancelledError } from '../../llm/tool-loop-control.js';

test('resolveToolContextAnthropic: 工具抛 ToolLoopCancelledError 时透传不吞', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      content: [{ type: 'tool_use', id: 'tu1', name: 'cancelTool', input: {} }],
      usage: {},
    }),
  });
  try {
    await assert.rejects(
      () => resolveToolContextAnthropic(
        [{ role: 'user', content: 'x' }],
        [{
          type: 'function',
          function: {
            name: 'cancelTool',
            description: 't',
            parameters: { type: 'object', properties: {} },
          },
        }],
        { cancelTool: async () => { throw new ToolLoopCancelledError('mock cancel'); } },
        { model: 'claude-test', api_key: 'k', max_tokens: 100 },
      ),
      (err) => err.name === 'ToolLoopCancelledError' && /mock cancel/.test(err.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
