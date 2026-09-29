import { Router } from 'express';
import {
  getThemeCss,
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

export default router;
