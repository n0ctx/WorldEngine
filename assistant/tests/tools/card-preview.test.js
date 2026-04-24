import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../../backend/tests/helpers/test-env.js';
import {
  insertCharacter,
  insertEntryCondition,
  insertCharacterStateField,
  insertPersona,
  insertPersonaStateField,
  insertWorld,
  insertWorldEntry,
  insertWorldStateField,
} from '../../../backend/tests/helpers/fixtures.js';

const sandbox = createTestSandbox('assistant-card-preview-suite', {
  global_system_prompt: '全局系统提示',
});
sandbox.setEnv();

after(() => {
  sandbox.cleanup();
});

async function loadCardPreview() {
  return freshImport('assistant/server/tools/card-preview.js');
}

test('createPreviewCardTool 在 create 场景返回全局/世界 prompt 上下文', async () => {
  const { createPreviewCardTool } = await loadCardPreview();
  const world = insertWorld(sandbox.db, { name: '晨星海' });
  const tool = createPreviewCardTool({ worldId: world.id });

  const worldCreate = JSON.parse(await tool.execute({ target: 'world-card', operation: 'create' }));
  const characterCreate = JSON.parse(await tool.execute({ target: 'character-card', operation: 'create' }));

  assert.equal(worldCreate._globalSystemPrompt, '全局系统提示');
  assert.equal(characterCreate._globalSystemPrompt, '全局系统提示');
  assert.equal(characterCreate._worldSystemPrompt, '');
});

test('createPreviewCardTool 会返回实体详情、现有条目与状态字段', async () => {
  const { createPreviewCardTool } = await loadCardPreview();
  const world = insertWorld(sandbox.db, { name: '白港', system_prompt: '海港设定' });
  insertPersona(sandbox.db, world.id, { name: '旅者' });
  const character = insertCharacter(sandbox.db, world.id, { name: '伊瑟', system_prompt: '角色设定' });
  const worldEntry = insertWorldEntry(sandbox.db, world.id, { title: '世界条目', content: '世界内容', trigger_type: 'state' });
  insertWorldStateField(sandbox.db, world.id, { field_key: 'weather', label: '天气' });
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'mood', label: '心情' });
  insertPersonaStateField(sandbox.db, world.id, { field_key: 'hp', label: '体力' });
  insertEntryCondition(sandbox.db, worldEntry.id, { target_field: '玩家.体力', operator: '<', value: '20' });

  const worldTool = createPreviewCardTool({ worldId: world.id });
  const characterTool = createPreviewCardTool({ characterId: character.id });

  const worldData = JSON.parse(await worldTool.execute({ target: 'world-card' }));
  const characterData = JSON.parse(await characterTool.execute({ target: 'character-card' }));

  assert.equal(worldData.name, '白港');
  assert.equal(worldData.existingEntries.length, 1);
  assert.deepEqual(worldData.existingEntries[0].conditions, [
    { id: worldData.existingEntries[0].conditions[0].id, entry_id: worldEntry.id, target_field: '玩家.体力', operator: '<', value: '20' },
  ]);
  assert.equal(worldData.existingWorldStateFields.length, 1);
  assert.equal(worldData.existingPersonaStateFields.length, 1);

  assert.equal(characterData.name, '伊瑟');
  assert.equal(characterData.existingEntries, undefined);
  assert.equal(characterData.existingCharacterStateFields.length, 1);
  assert.equal(characterData._worldSystemPrompt, '海港设定');
});

test('createPreviewCardTool 在缺少上下文或 target 非法时返回错误字符串', async () => {
  const { createPreviewCardTool } = await loadCardPreview();
  const tool = createPreviewCardTool({});

  assert.match(
    await tool.execute({ target: 'world-card', operation: 'update' }),
    /请先选择一个世界/,
  );
  assert.match(
    await tool.execute({ target: 'unknown-target' }),
    /未知的 target/,
  );
});

test('createPreviewCardTool 会返回 persona-card 与 global-prompt 的完整上下文', async () => {
  const { createPreviewCardTool } = await loadCardPreview();
  const world = insertWorld(sandbox.db, { name: '镜城', system_prompt: '镜城设定' });
  insertPersona(sandbox.db, world.id, { name: '旅者', system_prompt: '玩家设定' });
  insertPersonaStateField(sandbox.db, world.id, { field_key: 'trust', label: '信任' });

  const tool = createPreviewCardTool({ worldId: world.id });
  const personaData = JSON.parse(await tool.execute({ target: 'persona-card' }));
  const globalData = JSON.parse(await tool.execute({ target: 'global-prompt' }));

  assert.equal(personaData.name, '旅者');
  assert.equal(personaData.system_prompt, '玩家设定');
  assert.equal(personaData.existingPersonaStateFields.length, 1);
  assert.equal(personaData._globalSystemPrompt, '全局系统提示');
  assert.equal(personaData._worldSystemPrompt, '镜城设定');

  assert.equal(globalData.global_system_prompt, '全局系统提示');
  assert.equal(globalData.existingEntries, undefined);
});
