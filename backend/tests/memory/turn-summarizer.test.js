import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';

const sandbox = createTestSandbox('turn-summarizer-suite');
sandbox.setEnv();
after(() => sandbox.cleanup());

test('parseSummaryPayload 解析 scene / cast / summary / memory 并截断 cast', async () => {
  const { __testables } = await freshImport('backend/memory/turn-summarizer.js');
  const raw = [
    '```json',
    '{"scene":"图书馆","cast":["赵齐","白羽岚","甲","乙","丙"],',
    '"summary":"赵齐在图书馆提出风力发电方案，白羽岚以造价昂贵为由否决。",',
    '"memory":["- [任务|P4|植树|任务完成前] 两人约定次日种树"]}',
    '```',
  ].join('\n');
  const result = __testables.parseSummaryPayload(raw);

  assert.equal(result.scene, '图书馆');
  assert.deepEqual(result.cast, ['赵齐', '白羽岚', '甲', '乙']);
  assert.match(result.summary, /风力发电/);
  assert.deepEqual(result.memoryLines, ['[任务|P4|植树|任务完成前] 两人约定次日种树']);
});

test('parseSummaryPayload 对非 JSON 输出降级为纯摘要', async () => {
  const { __testables } = await freshImport('backend/memory/turn-summarizer.js');
  const result = __testables.parseSummaryPayload('赵齐与白羽岚约定次日去林地种树。');

  assert.equal(result.summary, '赵齐与白羽岚约定次日去林地种树。');
  assert.equal(result.scene, '');
  assert.deepEqual(result.cast, []);
  assert.deepEqual(result.memoryLines, []);
});
