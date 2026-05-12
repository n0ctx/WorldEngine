import { Router } from 'express';
import {
  deleteTheme,
  exportThemePackage,
  getThemeCss,
  importThemePackage,
  listThemes,
  setActiveTheme,
} from '../services/themes.js';

const router = Router();

router.get('/themes', (_req, res) => {
  try {
    res.json(listThemes());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/themes/:id/css', (req, res) => {
  try {
    res.type('text/css').send(getThemeCss(req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.put('/themes/active', (req, res) => {
  try {
    const { id } = req.body || {};
    res.json(setActiveTheme(id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/themes/import', (req, res) => {
  try {
    res.status(201).json(importThemePackage(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/themes/:id/export', (req, res) => {
  try {
    res.json(exportThemePackage(req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.delete('/themes/:id', (req, res) => {
  try {
    deleteTheme(req.params.id);
    res.status(204).end();
  } catch (err) {
    const status = err.message.includes('不能删除') ? 400 : 404;
    res.status(status).json({ error: err.message });
  }
});

export default router;
