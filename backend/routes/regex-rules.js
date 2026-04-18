/**
 * 正则替换规则路由
 *
 * GET    /api/regex-rules              列出全部（支持 ?scope=xxx&worldId=xxx 过滤）
 * POST   /api/regex-rules              创建
 * PUT    /api/regex-rules/reorder      批量排序（必须在 :id 前注册）
 * GET    /api/regex-rules/:id          详情
 * PUT    /api/regex-rules/:id          更新（白名单 name/enabled/pattern/replacement/flags/scope/world_id）
 * DELETE /api/regex-rules/:id
 */

import { Router } from 'express';
import {
  createRegexRule,
  getRegexRuleById,
  listRegexRules,
  updateRegexRule,
  deleteRegexRule,
  reorderRegexRules,
} from '../services/regex-rules.js';

const router = Router();

router.get('/regex-rules', (req, res) => {
  const { scope, worldId, mode } = req.query;
  const filters = {};
  if (scope) filters.scope = scope;
  if (worldId !== undefined) filters.worldId = worldId || null;
  if (mode) filters.mode = mode;
  res.json(listRegexRules(filters));
});

router.post('/regex-rules', (req, res) => {
  const { name, pattern, scope } = req.body;
  if (!name) return res.status(400).json({ error: 'name 为必填项' });
  if (!pattern) return res.status(400).json({ error: 'pattern 为必填项' });
  if (!scope) return res.status(400).json({ error: 'scope 为必填项' });

  const VALID_SCOPES = ['user_input', 'ai_output', 'display_only', 'prompt_only'];
  if (!VALID_SCOPES.includes(scope)) {
    return res.status(400).json({ error: `scope 必须是以下之一：${VALID_SCOPES.join(', ')}` });
  }

  const rule = createRegexRule(req.body);
  res.status(201).json(rule);
});

// reorder 必须在 :id 路由前注册
router.put('/regex-rules/reorder', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items 为必填数组' });
  }
  reorderRegexRules(items);
  res.json({ ok: true });
});

router.get('/regex-rules/:id', (req, res) => {
  const rule = getRegexRuleById(req.params.id);
  if (!rule) return res.status(404).json({ error: '规则不存在' });
  res.json(rule);
});

router.put('/regex-rules/:id', (req, res) => {
  const rule = updateRegexRule(req.params.id, req.body);
  if (!rule) return res.status(404).json({ error: '规则不存在' });
  res.json(rule);
});

router.delete('/regex-rules/:id', (req, res) => {
  deleteRegexRule(req.params.id);
  res.status(204).end();
});

export default router;
