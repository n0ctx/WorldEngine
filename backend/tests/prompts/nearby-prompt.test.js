import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNearbyPromptSection } from '../../prompts/nearby-prompt.js';

const fields = [
  { field_key: 'mood', label: '心情', type: 'text' },
  { field_key: 'hp', label: '生命', type: 'number', min_value: 0, max_value: 100 },
  { field_key: 'tags', label: '标签', type: 'list' },
];

test('空字段（缺失/null/空串/空数组/空对象）被识别进「待补全字段」', () => {
  const pool = [{
    id: 'a1',
    name: '林晚',
    is_saved: 0,
    persona: '',
    state: { mood: '平静', hp: null, tags: [] }, // mood 有值；hp null、tags 空数组 → 待补全
  }];
  const section = buildNearbyPromptSection(pool, fields);
  const line = section.split('\n').find((l) => l.includes('[id=a1]'));
  assert.ok(line.includes('待补全字段（本轮必须填）：[hp, tags]'), line);
});

test('缺失 key 也算空字段', () => {
  const pool = [{ id: 'b1', name: '佐藤遥', is_saved: 1, persona: '冷静', state: { mood: '愉快' } }];
  const section = buildNearbyPromptSection(pool, fields);
  const line = section.split('\n').find((l) => l.includes('[id=b1]'));
  assert.ok(line.includes('待补全字段（本轮必须填）：[hp, tags]'), line);
});

test('全部字段有值时不标注待补全', () => {
  const pool = [{
    id: 'c1',
    name: 'Marcus',
    is_saved: 1,
    persona: '老兵',
    state: { mood: '警惕', hp: 80, tags: ['佣兵'] },
  }];
  const section = buildNearbyPromptSection(pool, fields);
  const line = section.split('\n').find((l) => l.includes('[id=c1]'));
  assert.ok(!line.includes('待补全字段'), line);
});

test('空池输出占位且不报错', () => {
  const section = buildNearbyPromptSection([], fields);
  assert.ok(section.includes('（空）'));
});
