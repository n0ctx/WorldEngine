import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../../backend/tests/helpers/test-env.js';
import {
  insertCharacter,
  insertEntryCondition,
  insertCharacterStateField,
  insertCharacterStateValue,
  insertPersona,
  insertPersonaStateField,
  insertPersonaStateValue,
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
  const world = insertWorld(sandbox.db, { name: '晨星海', description: '海上群岛' });
  insertWorldEntry(sandbox.db, world.id, { title: '世界背景', content: '群岛秩序' });
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'level', label: '等级' });
  insertPersonaStateField(sandbox.db, world.id, { field_key: 'hp', label: '生命值' });
  const tool = createPreviewCardTool({ worldId: world.id });

  const worldCreate = JSON.parse(await tool.execute({ target: 'world-card', operation: 'create' }));
  const characterCreate = JSON.parse(await tool.execute({ target: 'character-card', operation: 'create' }));
  const personaCreate = JSON.parse(await tool.execute({ target: 'persona-card', operation: 'create' }));

  assert.equal(worldCreate._globalSystemPrompt, undefined);
  assert.equal(characterCreate._globalSystemPrompt, undefined);
  assert.equal(characterCreate._worldName, '晨星海');
  assert.equal(characterCreate._worldDescription, '海上群岛');
  assert.equal(characterCreate.existingWorldEntries.length, 1);
  assert.equal(characterCreate.existingCharacterStateFields.length, 1);
  assert.equal(characterCreate.existingCharacterStateFields[0].field_key, 'level');
  assert.equal(characterCreate.existingPersonaStateFields.length, 1);
  assert.equal(personaCreate.existingPersonaStateFields.length, 1);
  assert.equal(personaCreate.existingPersonaStateFields[0].field_key, 'hp');
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
  insertCharacterStateValue(sandbox.db, character.id, { field_key: 'mood', default_value_json: '"警觉"' });
  insertPersonaStateValue(sandbox.db, world.id, { field_key: 'hp', default_value_json: '80' });
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
  assert.equal(characterData.existingWorldEntries.length, 1);
  assert.equal(characterData.existingCharacterStateFields.length, 1);
  assert.equal(characterData.existingCharacterStateValues.length, 1);
  assert.equal(characterData.existingCharacterStateValues[0].field_key, 'mood');
  assert.equal(characterData.existingCharacterStateValues[0].effective_value_json, '"警觉"');
  assert.equal(characterData._worldName, '白港');
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
  insertPersonaStateValue(sandbox.db, world.id, { field_key: 'trust', default_value_json: '60' });

  const tool = createPreviewCardTool({ worldId: world.id });
  const personaData = JSON.parse(await tool.execute({ target: 'persona-card' }));
  const globalData = JSON.parse(await tool.execute({ target: 'global-prompt' }));

  assert.equal(personaData.name, '旅者');
  assert.equal(personaData.system_prompt, '玩家设定');
  assert.equal(personaData.existingWorldEntries.length, 0);
  assert.equal(personaData.existingPersonaStateFields.length, 1);
  assert.equal(personaData.existingPersonaStateValues.length, 1);
  assert.equal(personaData.existingPersonaStateValues[0].field_key, 'trust');
  assert.equal(personaData._globalSystemPrompt, undefined);
  assert.equal(personaData._worldName, '镜城');
  assert.equal(personaData._worldDescription, '');

  assert.equal(globalData.global_system_prompt, '全局系统提示');
  assert.equal(globalData.existingEntries, undefined);
});

test('createPreviewCardTool 在数据量正常时不会返回截断标记', async () => {
  const { createPreviewCardTool } = await loadCardPreview();
  const world = insertWorld(sandbox.db, { name: '小世界' });
  insertWorldEntry(sandbox.db, world.id, { title: '条目1', content: '内容1' });
  insertWorldStateField(sandbox.db, world.id, { field_key: 'weather', label: '天气' });

  const tool = createPreviewCardTool({ worldId: world.id });
  const data = JSON.parse(await tool.execute({ target: 'world-card' }));

  assert.equal(data.existingEntries.length, 1);
  assert.equal(data._existingEntriesMeta, undefined);
  assert.equal(data._existingWorldStateFieldsMeta, undefined);
});

test('createPreviewCardTool 在条目过多时返回截断标记', async () => {
  const { createPreviewCardTool } = await loadCardPreview();
  const world = insertWorld(sandbox.db, { name: '大世界' });
  for (let i = 0; i < 105; i++) {
    insertWorldEntry(sandbox.db, world.id, { title: `条目${i}`, content: `内容${i}` });
  }

  const tool = createPreviewCardTool({ worldId: world.id });
  const data = JSON.parse(await tool.execute({ target: 'world-card' }));

  assert.equal(data.existingEntries.length, 100);
  assert.deepEqual(data._existingEntriesMeta, { total: 105, limit: 100 });
});
