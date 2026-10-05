import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  analyzeEntityForCard,
  createCharacterFromEntity,
  createEntityFromCard,
  createPersonaFromEntity,
  createStateEntity,
  createStateRelation,
  createStateThread,
  deleteStateEntity,
  deleteStateRelation,
  fetchStateMemory,
  fetchStateMemorySchema,
  updateStateEntity,
  updateStateEntityField,
  updateStateThread,
  updateStateWorld,
} from '../../src/core/api/state-memory.js';

describe('state-memory api', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
  });

  it('GET 聚合视图', async () => {
    await fetchStateMemory('s1');
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/state-memory', expect.any(Object));
  });

  it('新建实体', async () => {
    await createStateEntity('s1', { type: 'character', name: '沈彦' });
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/state-memory/entities', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ type: 'character', name: '沈彦' }),
    }));
  });

  it('改动实体', async () => {
    await updateStateEntity('s1', 'e1', { pinned: true });
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/state-memory/entities/e1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ pinned: true }),
    }));
  });

  it('删除实体', async () => {
    await deleteStateEntity('s1', 'e1');
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/state-memory/entities/e1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('改动实体用户字段', async () => {
    await updateStateEntityField('s1', 'e1', 'favor', 60);
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/state-memory/entities/e1/fields/favor', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ value: 60 }),
    }));
  });

  it('从角色卡建立实体', async () => {
    await createEntityFromCard('s1', 'char-1');
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/state-memory/entities/from-card', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ character_id: 'char-1' }),
    }));
  });

  it('分析实体制成角色卡草稿', async () => {
    await analyzeEntityForCard('s1', 'e1');
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/state-memory/entities/e1/analyze', expect.objectContaining({ method: 'POST' }));
  });

  it('改动世界档案', async () => {
    await updateStateWorld('s1', { time: '1000-03-16T08:00' });
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/state-memory/world', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ time: '1000-03-16T08:00' }),
    }));
  });

  it('新建与删除关系', async () => {
    await createStateRelation('s1', { subject_id: 'e1', predicate: '持有者', object_id: 'e2' });
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/state-memory/relations', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ subject_id: 'e1', predicate: '持有者', object_id: 'e2' }),
    }));

    await deleteStateRelation('s1', 'r1');
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/state-memory/relations/r1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('新建与改动事项', async () => {
    await createStateThread('s1', { kind: '承诺', participants: ['e1'], content: '三日内归还账本' });
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/state-memory/threads', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ kind: '承诺', participants: ['e1'], content: '三日内归还账本' }),
    }));

    await updateStateThread('s1', 't1', { status: 'resolved' });
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/state-memory/threads/t1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved' }),
    }));
  });

  it('从实体制成角色卡', async () => {
    const payload = { session_id: 's1', entity_id: 'e1', name: '沈彦', system_prompt: '', description: '', first_message: '' };
    await createCharacterFromEntity('world-1', payload);
    expect(fetch).toHaveBeenCalledWith('/api/worlds/world-1/characters/from-entity', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(payload),
    }));
  });

  it('从实体存为玩家卡', async () => {
    const payload = { session_id: 's1', entity_id: 'e1', name: '沈彦', system_prompt: '', description: '' };
    await createPersonaFromEntity('world-1', payload);
    expect(fetch).toHaveBeenCalledWith('/api/worlds/world-1/personas/from-entity', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(payload),
    }));
  });

  it('获取状态记忆 schema', async () => {
    await fetchStateMemorySchema();
    expect(fetch).toHaveBeenCalledWith('/api/state-memory/schema', expect.any(Object));
  });

  it('失败时按状态码或后端 error 抛错', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: '实体不存在' }) });
    await expect(updateStateEntity('s1', 'missing', {})).rejects.toThrow('实体不存在');
  });
});
