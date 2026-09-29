import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig, updateConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const THEMES_DIR = process.env.WE_ROOT_THEMES_DIR || path.join(REPO_ROOT, 'themes');

const THEME_ID_RE = /^[a-z][a-z0-9_-]{1,63}$/;
const DEFAULT_THEME_ID = 'nocturne';

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    throw new Error(`主题元信息读取失败：${err.message}`, { cause: err });
  }
}

function normalizeMeta(meta) {
  if (!isPlainObject(meta)) throw new Error('theme.json 必须是对象');
  if (typeof meta.id !== 'string' || !THEME_ID_RE.test(meta.id)) {
    throw new Error('主题 id 必须以小写字母开头，仅包含小写字母、数字、下划线或连字符，长度 2-64');
  }
  if (typeof meta.name !== 'string' || !meta.name.trim()) throw new Error('theme.json 缺少 name');
  if (typeof meta.version !== 'string' || !meta.version.trim()) throw new Error('theme.json 缺少 version');
  return {
    id: meta.id,
    name: meta.name.trim(),
    version: meta.version.trim(),
    author: typeof meta.author === 'string' ? meta.author : '',
    description: typeof meta.description === 'string' ? meta.description : '',
    preview: isPlainObject(meta.preview) ? meta.preview : {},
  };
}

function readThemeDir(dirPath) {
  const metaPath = path.join(dirPath, 'theme.json');
  const cssPath = path.join(dirPath, 'theme.css');
  if (!fs.existsSync(metaPath)) throw new Error('主题包缺少 theme.json');
  if (!fs.existsSync(cssPath)) throw new Error('主题包缺少 theme.css');
  const meta = normalizeMeta(readJsonFile(metaPath));
  if (path.basename(dirPath) !== meta.id) {
    throw new Error('主题目录名必须与 theme.json 的 id 一致');
  }
  return { ...meta, cssPath };
}

function scanThemes() {
  if (!fs.existsSync(THEMES_DIR)) return [];
  return fs.readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => readThemeDir(path.join(THEMES_DIR, entry.name)))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function findTheme(id) {
  return scanThemes().find((theme) => theme.id === id) || null;
}

// 主题目录可能在磁盘层面被直接删除或改名，此时 config.ui.theme 会残留一个已不存在的 id。
// 这里统一兜底回落到默认主题并持久化修正，避免前端拿到一个请求 CSS 必 404 的主题 id。
export function resolveActiveThemeId() {
  const config = getConfig();
  const id = config.ui?.theme || DEFAULT_THEME_ID;
  if (findTheme(id)) return id;
  updateConfig({ ui: { theme: DEFAULT_THEME_ID } });
  return DEFAULT_THEME_ID;
}

export function listThemes() {
  return {
    activeTheme: resolveActiveThemeId(),
    themes: scanThemes().map(({ cssPath: _cssPath, ...theme }) => theme),
  };
}

export function getThemeCss(id) {
  const theme = findTheme(id);
  if (!theme) throw new Error('主题不存在');
  return fs.readFileSync(theme.cssPath, 'utf-8');
}

export function setActiveTheme(id) {
  const theme = findTheme(id);
  if (!theme) throw new Error('主题不存在');
  const updated = updateConfig({ ui: { theme: id } });
  return { activeTheme: updated.ui?.theme || id };
}
