import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import { insertWorld, insertPersona, insertCharacter, insertSession } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('memory-state-memory-evidence');
sandbox.setEnv();
after(() => sandbox.cleanup());
const { applyStateMemoryOps, normalizeEvidence, truncateText, truncateListItems } = await freshImport('backend/memory/state-memory-apply.js');
const { listThreads, isThreadEvidenceCurrent, rollbackStateMemory } = await freshImport('backend/db/queries/state-memory.js');
const { createMessage, updateMessageContent } = await freshImport('backend/db/queries/messages.js');
function setupSession() {
  const world = insertWorld(sandbox.db);
  const persona = insertPersona(sandbox.db, world.id, { name: '旅人' });
  const character = insertCharacter(sandbox.db, world.id, { name: '沈彦' });
  const session = insertSession(sandbox.db, { world_id: world.id, persona_id: persona.id, character_id: character.id, mode: 'chat' });
  return { world, session };
}
const noop = { turnText: '', realDate: false, mainCharacterEntityId: null };

test('normalizeEvidence 只保留非空字符串依据', () => {
  assert.equal(normalizeEvidence('  按剧情推断他已离开港口 '), '按剧情推断他已离开港口');
  assert.equal(normalizeEvidence('   '), null);
  assert.equal(normalizeEvidence(123), null);
  assert.equal(normalizeEvidence(undefined), null);
});

test('truncateText/truncateListItems 截断超长文本、条目与条数', () => {
  assert.equal(truncateText('字'.repeat(70)).length, 60);
  const items = Array.from({ length: 12 }, (_, i) => `项${i}`.repeat(10));
  const truncated = truncateListItems(items);
  assert.equal(truncated.length, 10);
  assert.ok(truncated.every((item) => item.length <= 30));
});

test('事项来源绑定同会话消息 ID、原文区间和内容版本；无来源或消息编辑后不显示为已核验', () => {
  const { world, session } = setupSession();
  const message = createMessage({ session_id: session.id, role: 'user', content: '你答应三天内归还账本。' });
  const otherSession = setupSession().session;
  const foreignMessage = createMessage({ session_id: otherSession.id, role: 'user', content: '你答应三天内归还账本。' });

  const opened = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [{
      op: 'open_thread', kind: '承诺', content: '三天内归还账本', participants: [], deadline: '1000-03-20',
      source: { message_id: message.id, quote: '你答应三天内归还账本' },
    }],
    evidenceMessageIds: [message.id], ...noop,
  });
  assert.equal(opened.applied, 1);
  const thread = listThreads(session.id)[0];
  assert.equal(thread.evidence_message_id, message.id);
  assert.equal(thread.evidence_start, 0);
  assert.equal(thread.evidence_end, '你答应三天内归还账本'.length);
  assert.equal(isThreadEvidenceCurrent(session.id, thread), true);

  const updated = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 2,
    ops: [{ op: 'update_thread', thread: 't1', content: '三天内归还账本，约定不变', source: { message_id: message.id, quote: '你答应三天内归还账本' } }],
    evidenceMessageIds: [message.id], ...noop,
  });
  assert.equal(updated.applied, 1);
  assert.equal(isThreadEvidenceCurrent(session.id, listThreads(session.id)[0]), true);

  const rejectedSource = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 3,
    ops: [{ op: 'update_thread', thread: 't1', content: '约定改动', source: { message_id: foreignMessage.id, quote: '你答应三天内归还账本' } }],
    evidenceMessageIds: [message.id], ...noop,
  });
  assert.equal(rejectedSource.applied, 1);
  assert.equal(listThreads(session.id)[0].evidence_message_id, null);

  rollbackStateMemory(session.id, 1);
  const restored = listThreads(session.id)[0];
  assert.equal(restored.evidence_message_id, message.id);
  assert.equal(isThreadEvidenceCurrent(session.id, restored), true);
  updateMessageContent(message.id, '你答应两天内归还账本。');
  assert.equal(isThreadEvidenceCurrent(session.id, restored), false);
});
