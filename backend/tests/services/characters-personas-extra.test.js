import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import {
  insertWorld,
  insertCharacter,
  insertCharacterStateField,
  insertPersona,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('service-chars-personas-extra');
sandbox.setEnv();

after(() => sandbox.cleanup());

// ─── characters.js ──────────────────────────────────────────────────────

test('createCharacter 会按世界已定义的 character_state_fields 初始化默认值', async () => {
  const world = insertWorld(sandbox.db, { name: '角色-初始化-世界' });
  insertCharacterStateField(sandbox.db, world.id, {
    field_key: 'hp_char',
    label: 'HP',
    type: 'number',
    default_value: '100',
  });
  insertCharacterStateField(sandbox.db, world.id, {
    field_key: 'mood_char',
    label: '心情',
    type: 'text',
    default_value: '平静',
  });

  const { createCharacter } = await freshImport('backend/services/characters.js');
  const character = createCharacter({ world_id: world.id, name: '种子角色' });

  const rows = sandbox.db.prepare(`
    SELECT field_key, default_value_json FROM character_state_values WHERE character_id = ? ORDER BY field_key
  `).all(character.id);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].default_value_json, '100');
  assert.equal(rows[1].default_value_json, '平静');
});

test('updateCharacter 在替换 avatar_path 时会清理旧头像文件', async () => {
  const world = insertWorld(sandbox.db, { name: '头像-世界' });
  const oldAvatar = path.join(sandbox.uploadsDir, 'avatars', 'old.png');
  fs.mkdirSync(path.dirname(oldAvatar), { recursive: true });
  fs.writeFileSync(oldAvatar, 'old');
  const character = insertCharacter(sandbox.db, world.id, { name: '换头像', avatar_path: 'avatars/old.png' });

  const { updateCharacter } = await freshImport('backend/services/characters.js');
  await updateCharacter(character.id, { avatar_path: 'avatars/new.png' });
  assert.equal(fs.existsSync(oldAvatar), false, '旧头像文件应被删除');
});

test('updateCharacter 在不传 avatar_path 时不会查询/删除任何头像', async () => {
  const world = insertWorld(sandbox.db, { name: '不动头像-世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '不动' });
  const { updateCharacter } = await freshImport('backend/services/characters.js');
  const updated = await updateCharacter(character.id, { name: '改名了' });
  assert.equal(updated.name, '改名了');
});

test('deleteCharacter 触发 cleanup 钩子并删除 DB 记录', async () => {
  const world = insertWorld(sandbox.db, { name: '删角色-世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '将被删除' });

  const { registerOnDelete } = await freshImport('backend/utils/cleanup-hooks.js');
  let fired = null;
  registerOnDelete('character', async (id) => { fired = id; });

  const { deleteCharacter, getCharacterById } = await freshImport('backend/services/characters.js');
  await deleteCharacter(character.id);
  assert.equal(fired, character.id);
  assert.equal(getCharacterById(character.id), undefined);
});

test('reorderCharacters 与 getCharactersByWorldId 调通 DB 调用层', async () => {
  const world = insertWorld(sandbox.db, { name: 'reorder-世界' });
  const c1 = insertCharacter(sandbox.db, world.id, { name: '甲', sort_order: 0 });
  const c2 = insertCharacter(sandbox.db, world.id, { name: '乙', sort_order: 1 });

  const { reorderCharacters, getCharactersByWorldId } = await freshImport('backend/services/characters.js');
  reorderCharacters([{ id: c1.id, sort_order: 1 }, { id: c2.id, sort_order: 0 }]);
  const list = getCharactersByWorldId(world.id);
  assert.equal(list.find((c) => c.id === c2.id).sort_order, 0);
  assert.equal(list.find((c) => c.id === c1.id).sort_order, 1);
});

// ─── personas.js ────────────────────────────────────────────────────────

test('getOrCreatePersona 在 persona 不存在时会创建空 persona', async () => {
  const world = insertWorld(sandbox.db, { name: 'persona-getOrCreate' });
  const { getOrCreatePersona } = await freshImport('backend/services/personas.js');
  const persona = getOrCreatePersona(world.id);
  assert.ok(persona.id);
  assert.equal(persona.world_id, world.id);

  // 第二次调用应返回同一条
  const again = getOrCreatePersona(world.id);
  assert.equal(again.id, persona.id);
});

test('listPersonas 返回 ≥1 条 persona（自动 ensure）', async () => {
  const world = insertWorld(sandbox.db, { name: 'list-persona' });
  const { listPersonas } = await freshImport('backend/services/personas.js');
  const list = listPersonas(world.id);
  assert.ok(list.length >= 1);
});

test('createPersona 创建新 persona 并保留 name/system_prompt', async () => {
  const world = insertWorld(sandbox.db, { name: 'create-persona' });
  const { createPersona } = await freshImport('backend/services/personas.js');
  const p = createPersona(world.id, { name: '甲玩家', system_prompt: '你是甲' });
  assert.equal(p.name, '甲玩家');
  assert.equal(p.system_prompt, '你是甲');
});

test('updatePersona 通过 worldId 修改 active persona', async () => {
  const world = insertWorld(sandbox.db, { name: 'update-active-persona' });
  insertPersona(sandbox.db, world.id, { name: '原名' });
  const { updatePersona } = await freshImport('backend/services/personas.js');
  const updated = await updatePersona(world.id, { name: '改后' });
  assert.equal(updated.name, '改后');
});

test('updatePersonaByIdService 在替换 avatar_path 时清理旧文件', async () => {
  const world = insertWorld(sandbox.db, { name: 'persona-avatar' });
  const oldAvatar = path.join(sandbox.uploadsDir, 'avatars', 'old-persona.png');
  fs.mkdirSync(path.dirname(oldAvatar), { recursive: true });
  fs.writeFileSync(oldAvatar, 'old');
  const persona = insertPersona(sandbox.db, world.id, { name: '原', avatar_path: 'avatars/old-persona.png' });

  const { updatePersonaByIdService } = await freshImport('backend/services/personas.js');
  await updatePersonaByIdService(persona.id, { avatar_path: 'avatars/new-persona.png' });
  assert.equal(fs.existsSync(oldAvatar), false);
});

test('deletePersonaService 在 persona 不存在时抛错', async () => {
  const { deletePersonaService } = await freshImport('backend/services/personas.js');
  await assert.rejects(() => deletePersonaService('ghost-persona'), /玩家卡不存在/);
});

test('deletePersonaService 删除存在的 persona 并清理头像（保留至少 1 张）', async () => {
  const world = insertWorld(sandbox.db, { name: 'del-persona' });
  // 先插入两张：第一张保底，第二张被删除
  insertPersona(sandbox.db, world.id, { name: '保底' });
  const avatarFile = path.join(sandbox.uploadsDir, 'avatars', 'del-persona.png');
  fs.mkdirSync(path.dirname(avatarFile), { recursive: true });
  fs.writeFileSync(avatarFile, 'x');
  const persona = insertPersona(sandbox.db, world.id, { name: '待删', avatar_path: 'avatars/del-persona.png' });

  const { deletePersonaService } = await freshImport('backend/services/personas.js');
  await deletePersonaService(persona.id);
  const found = sandbox.db.prepare('SELECT * FROM personas WHERE id = ?').get(persona.id);
  assert.equal(found, undefined);
  assert.equal(fs.existsSync(avatarFile), false);
});

test('activatePersona 校验 persona 属于该世界，并切换激活态', async () => {
  const worldA = insertWorld(sandbox.db, { name: '世界A' });
  const worldB = insertWorld(sandbox.db, { name: '世界B' });
  const personaA = insertPersona(sandbox.db, worldA.id, { name: 'A' });
  const personaB = insertPersona(sandbox.db, worldB.id, { name: 'B' });

  const { activatePersona } = await freshImport('backend/services/personas.js');
  // 跨世界激活会失败
  assert.throws(() => activatePersona(worldA.id, personaB.id), /不属于该世界/);

  // 同世界激活会切换
  const list = activatePersona(worldA.id, personaA.id);
  assert.ok(list.find((p) => p.id === personaA.id && p.is_active === 1));
});
