import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateCharacterImportPayload,
  validateWorldImportPayload,
} from '../services/import-export-validation.js';

test('validateCharacterImportPayload 接受最小合法角色卡', function () {
  assert.doesNotThrow(() => {
    validateCharacterImportPayload({
      format: 'worldengine-character-v1',
      character: { name: '测试角色' },
      prompt_entries: [],
      character_state_values: [],
    });
  });
});

test('validateCharacterImportPayload 拒绝超大头像', function () {
  const hugeBase64 = Buffer.alloc((5 * 1024 * 1024) + 1, 1).toString('base64');

  assert.throws(() => {
    validateCharacterImportPayload({
      format: 'worldengine-character-v1',
      character: {
        name: '测试角色',
        avatar_base64: hugeBase64,
        avatar_mime: 'image/png',
      },
      prompt_entries: [],
      character_state_values: [],
    });
  }, /头像过大/);
});

test('validateWorldImportPayload 接受最小合法世界卡', function () {
  assert.doesNotThrow(() => {
    validateWorldImportPayload({
      format: 'worldengine-world-v1',
      world: { name: '测试世界' },
      prompt_entries: [],
      world_state_fields: [],
      character_state_fields: [],
      persona_state_fields: [],
      world_state_values: [],
      persona_state_values: [],
      characters: [],
    });
  });
});
