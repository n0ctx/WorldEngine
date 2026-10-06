import test from 'node:test';
import assert from 'node:assert/strict';

import { extractJsonPatch } from '../../memory/state-update-json.js';

test('extractJsonPatch 去掉数组里提前关闭对象的多余右花括号，后面的键留在原对象里', () => {
  const raw = '{"memory": [{"op": "create_entity", "name": "柳师叔", "profile": {"gender": "女"}}, "aliases": ["柳长老"]}, {"op": "set_state", "entity": "e1", "key": "位置", "value": "青溪镇"}], "present": ["e1"]}';
  assert.deepEqual(extractJsonPatch(raw, 'test'), {
    memory: [
      { op: 'create_entity', name: '柳师叔', profile: { gender: '女' }, aliases: ['柳长老'] },
      { op: 'set_state', entity: 'e1', key: '位置', value: '青溪镇' },
    ],
    present: ['e1'],
  });
});

test('extractJsonPatch 去掉提前关闭最外层对象的多余右花括号', () => {
  const raw = '{"persona": {"hp": 3}}, "present": ["e1"]}';
  assert.deepEqual(extractJsonPatch(raw, 'test'), { persona: { hp: 3 }, present: ['e1'] });
});

test('extractJsonPatch 不把对象里的嵌套对象收尾、字符串里的右花括号当成多余', () => {
  const raw = '{"entity_fields": {"e2": {"title": "掌门}"}, "e3": {"title": "无"}}, "memory": [],}';
  assert.deepEqual(extractJsonPatch(raw, 'test'), {
    entity_fields: { e2: { title: '掌门}' }, e3: { title: '无' } },
    memory: [],
  });
});
