import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig, updateConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ROOT_THEMES_DIR = process.env.WE_ROOT_THEMES_DIR || path.join(REPO_ROOT, 'themes');
const DATA_THEMES_DIR = process.env.WE_DATA_DIR
  ? path.resolve(process.env.WE_DATA_DIR, 'themes')
  : path.join(REPO_ROOT, 'data', 'themes');

const THEME_ID_RE = /^[a-z][a-z0-9_-]{1,63}$/;
const THEME_FORMAT = 'worldengine-theme-v1';
export const DEFAULT_THEME_ID = 'classic-parchment';

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function assertThemeId(id) {
  if (typeof id !== 'string' || !THEME_ID_RE.test(id)) {
    throw new Error('主题 id 必须以小写字母开头，仅包含小写字母、数字、下划线或连字符，长度 2-64');
  }
}

function assertSafeThemePath(baseDir, themeId) {
  assertThemeId(themeId);
  const resolved = path.resolve(baseDir, themeId);
  const relative = path.relative(baseDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('主题路径非法');
  }
  return resolved;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    throw new Error(`主题元信息读取失败：${err.message}`);
  }
}

function normalizeMeta(meta, { builtin, source }) {
  if (!isPlainObject(meta)) throw new Error('theme.json 必须是对象');
  assertThemeId(meta.id);
  if (typeof meta.name !== 'string' || !meta.name.trim()) throw new Error('theme.json 缺少 name');
  if (typeof meta.version !== 'string' || !meta.version.trim()) throw new Error('theme.json 缺少 version');
  return {
    id: meta.id,
    name: meta.name.trim(),
    version: meta.version.trim(),
    author: typeof meta.author === 'string' ? meta.author : '',
    description: typeof meta.description === 'string' ? meta.description : '',
    preview: isPlainObject(meta.preview) ? meta.preview : {},
    builtin,
    source,
  };
}

function readThemeDir(dirPath, { builtin }) {
  const metaPath = path.join(dirPath, 'theme.json');
  const cssPath = path.join(dirPath, 'theme.css');
  if (!fs.existsSync(metaPath)) throw new Error('主题包缺少 theme.json');
  if (!fs.existsSync(cssPath)) throw new Error('主题包缺少 theme.css');
  const meta = normalizeMeta(readJsonFile(metaPath), {
    builtin,
    source: builtin ? 'builtin' : 'user',
  });
  if (path.basename(dirPath) !== meta.id) {
    throw new Error('主题目录名必须与 theme.json 的 id 一致');
  }
  return { ...meta, dirPath, cssPath };
}

function listThemeDirs(baseDir, builtin) {
  if (!fs.existsSync(baseDir)) return [];
  return fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => readThemeDir(path.join(baseDir, entry.name), { builtin }));
}

function scanThemes() {
  const rootThemes = listThemeDirs(ROOT_THEMES_DIR, true);
  const dataThemes = listThemeDirs(DATA_THEMES_DIR, false);
  const seen = new Set();
  const themes = [];

  for (const theme of [...rootThemes, ...dataThemes]) {
    if (seen.has(theme.id)) {
      if (theme.builtin) {
        throw new Error(`内置主题 id 重复：${theme.id}`);
      }
      continue;
    }
    seen.add(theme.id);
    themes.push(theme);
  }

  return themes.sort((a, b) => Number(a.builtin) === Number(b.builtin)
    ? a.name.localeCompare(b.name, 'zh-CN')
    : Number(b.builtin) - Number(a.builtin));
}

function findTheme(id) {
  assertThemeId(id);
  return scanThemes().find((theme) => theme.id === id) || null;
}

export function listThemes() {
  const config = getConfig();
  return {
    activeTheme: config.ui?.theme || DEFAULT_THEME_ID,
    themes: scanThemes().map(({ dirPath: _dirPath, cssPath: _cssPath, ...theme }) => theme),
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

function normalizeThemePackage(pkg) {
  if (!isPlainObject(pkg)) throw new Error('主题包必须是 JSON 对象');
  if (pkg.format !== THEME_FORMAT) throw new Error('主题包格式不正确');
  const theme = normalizeMeta(pkg.theme, { builtin: false, source: 'user' });
  if (typeof pkg.css !== 'string') throw new Error('主题包缺少 css 字符串');
  return { theme, css: pkg.css };
}

export function importThemePackage(pkg) {
  const { theme, css } = normalizeThemePackage(pkg);
  if (findTheme(theme.id)) throw new Error('主题 id 已存在');
  const targetDir = assertSafeThemePath(DATA_THEMES_DIR, theme.id);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'theme.json'), JSON.stringify({
    id: theme.id,
    name: theme.name,
    version: theme.version,
    author: theme.author,
    description: theme.description,
    preview: theme.preview,
  }, null, 2), 'utf-8');
  fs.writeFileSync(path.join(targetDir, 'theme.css'), css, 'utf-8');
  return { ...theme, builtin: false, source: 'user' };
}

export function exportThemePackage(id) {
  const theme = findTheme(id);
  if (!theme) throw new Error('主题不存在');
  const meta = readJsonFile(path.join(theme.dirPath, 'theme.json'));
  return {
    format: THEME_FORMAT,
    theme: {
      ...meta,
      builtin: theme.builtin,
    },
    css: fs.readFileSync(theme.cssPath, 'utf-8'),
  };
}

export function deleteTheme(id) {
  const theme = findTheme(id);
  if (!theme) throw new Error('主题不存在');
  if (theme.builtin) throw new Error('内置主题不能删除');
  fs.rmSync(assertSafeThemePath(DATA_THEMES_DIR, id), { recursive: true, force: true });
  const config = getConfig();
  if (config.ui?.theme === id) {
    updateConfig({ ui: { theme: DEFAULT_THEME_ID } });
  }
}
