/**
 * 自定义 CSS 片段路由
 *
 * GET    /api/custom-css-snippets
 * POST   /api/custom-css-snippets
 * PUT    /api/custom-css-snippets/reorder   (必须在 :id 前注册)
 * GET    /api/custom-css-snippets/:id
 * PUT    /api/custom-css-snippets/:id
 * DELETE /api/custom-css-snippets/:id
 */

import { Router } from 'express';
import {
  createCustomCssSnippet,
  getCustomCssSnippetById,
  listCustomCssSnippets,
  updateCustomCssSnippet,
  deleteCustomCssSnippet,
  reorderCustomCssSnippets,
} from '../services/custom-css-snippets.js';
import { assertExists } from '../utils/route-helpers.js';

const router = Router();

router.get('/custom-css-snippets', (req, res) => {
  const { mode } = req.query;
  res.json(listCustomCssSnippets(mode || undefined));
});

router.post('/custom-css-snippets', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name 为必填项' });
  const snippet = createCustomCssSnippet(req.body);
  res.status(201).json(snippet);
});

// reorder 必须在 :id 路由前注册
router.put('/custom-css-snippets/reorder', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items 为必填数组' });
  }
  reorderCustomCssSnippets(items);
  res.json({ ok: true });
});

router.get('/custom-css-snippets/:id', (req, res) => {
  const snippet = getCustomCssSnippetById(req.params.id);
  if (!assertExists(res, snippet, 'CSS 片段不存在')) return;
  res.json(snippet);
});

router.put('/custom-css-snippets/:id', (req, res) => {
  const snippet = updateCustomCssSnippet(req.params.id, req.body);
  if (!assertExists(res, snippet, 'CSS 片段不存在')) return;
  res.json(snippet);
});

router.delete('/custom-css-snippets/:id', (req, res) => {
  deleteCustomCssSnippet(req.params.id);
  res.status(204).end();
});

export default router;
