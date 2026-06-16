import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as worldCard from '../server/tools/apply-world-card.js';
import * as characterCard from '../server/tools/apply-character-card.js';
import * as personaCard from '../server/tools/apply-persona-card.js';
import * as cssSnippet from '../server/tools/apply-css-snippet.js';
import * as regexRule from '../server/tools/apply-regex-rule.js';
import * as theme from '../server/tools/apply-theme.js';
import { stateValueOpsSchema, stateFieldOpsSchema, entryOpsSchema } from '../server/tools/apply-schemas.js';

const ALL = [worldCard, characterCard, personaCard, cssSnippet, regexRule, theme];

// 递归找任意层 additionalProperties:false —— 本项目刻意不用它（normalize 的 pickAllowed 负责丢多余键），
// 它会让 provider strict 路径要求"全 required"，与重度可选设计相悖、且易触发 400。
function hasAdditionalPropsFalse(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.additionalProperties === false) return true;
  return Object.values(node).some(hasAdditionalPropsFalse);
}

// 递归找 oneOf/anyOf/allOf/tuple —— 易触发跨 provider 400 的关键字，schema 里不应出现。
function hasExoticKeyword(node) {
  if (!node || typeof node !== 'object') return false;
  if ('oneOf' in node || 'anyOf' in node || 'allOf' in node) return true;
  if (Array.isArray(node.items)) return true; // tuple 形式
  return Object.values(node).some(hasExoticKeyword);
}

test('每个 apply_* schema 可 JSON 序列化、含 operation/changes', () => {
  for (const mod of ALL) {
    const p = mod.definition.parameters;
    assert.doesNotThrow(() => JSON.stringify(p), `${mod.definition.name} 应可序列化`);
    assert.ok(p.properties.operation || mod.definition.name === 'apply_global_config', `${mod.definition.name} 应有 operation`);
    assert.ok(p.properties.changes, `${mod.definition.name} 应声明 changes`);
  }
});

test('schema 不含 additionalProperties:false（保持归一层负责丢多余键）', () => {
  for (const mod of ALL) {
    assert.equal(hasAdditionalPropsFalse(mod.definition.parameters), false, `${mod.definition.name} 不应有 additionalProperties:false`);
  }
});

test('schema 不含 oneOf/anyOf/allOf/tuple 等易 400 关键字', () => {
  for (const mod of ALL) {
    assert.equal(hasExoticKeyword(mod.definition.parameters), false, `${mod.definition.name} 不应含 exotic 关键字`);
  }
});

test('stateValueOps：value_json 可空字符串且三键 required（最高价值精度）', () => {
  const schema = stateValueOpsSchema(['persona']);
  const item = schema.items;
  assert.deepEqual(item.required, ['target', 'field_key', 'value_json']);
  assert.deepEqual(item.properties.value_json.type, ['string', 'null']);
  assert.deepEqual(item.properties.target.enum, ['persona']);
});

test('persona / character 的 stateValueOps target 与卡类型一致', () => {
  assert.deepEqual(personaCard.definition.parameters.properties.stateValueOps.items.properties.target.enum, ['persona']);
  assert.deepEqual(characterCard.definition.parameters.properties.stateValueOps.items.properties.target.enum, ['character']);
});

test('stateFieldOps / entryOps：op enum + 收紧字段对齐 normalize 的 throw 集', () => {
  assert.deepEqual(stateFieldOpsSchema.items.properties.op.enum, ['create', 'update', 'delete']);
  assert.deepEqual(stateFieldOpsSchema.items.properties.target.enum, ['world', 'persona', 'character']);
  assert.deepEqual(stateFieldOpsSchema.items.properties.type.enum, ['number', 'text', 'enum', 'list', 'boolean', 'datetime', 'table']);
  assert.deepEqual(entryOpsSchema.items.properties.op.enum, ['create', 'update', 'delete']);
  // coerce 字段不应被 enum 死（keyword_logic / trigger_type / update_mode）
  assert.equal(entryOpsSchema.items.properties.keyword_logic.enum, undefined);
  assert.equal(entryOpsSchema.items.properties.trigger_type.enum, undefined);
  assert.equal(stateFieldOpsSchema.items.properties.update_mode.enum, undefined);
});

test('persona changes 不暴露不被接受的 post_prompt/first_message', () => {
  const props = personaCard.definition.parameters.properties.changes.properties;
  assert.ok(props.system_prompt);
  assert.equal(props.post_prompt, undefined);
  assert.equal(props.first_message, undefined);
});
