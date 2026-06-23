/**
 * Provider Safety Events 查询路由
 *
 *   GET /api/provider-safety-events           列表（filter + cursor 分页）
 *   GET /api/provider-safety-events/stats     聚合统计
 *   GET /api/provider-safety-events/:id       单条详情
 *
 * 不暴露原文：返回的是 toPublicProviderSafetySignal() 已脱敏的结构。
 */

import { Router } from 'express';
import {
  listProviderSafetyEvents,
  getProviderSafetyStats,
  getProviderSafetyEventById,
  toPublicProviderSafetySignal,
} from '../services/provider-safety-events.js';

const router = Router();

router.get('/', (req, res) => {
  const items = listProviderSafetyEvents(req.query);
  res.json({ items: items.map(toPublicProviderSafetySignal) });
});

router.get('/stats', (req, res) => {
  res.json(getProviderSafetyStats(req.query));
});

router.get('/:id', (req, res) => {
  const event = getProviderSafetyEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'event not found' });
  res.json(toPublicProviderSafetySignal(event));
});

export default router;
