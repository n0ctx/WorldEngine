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

export function assertThemeId(id) {
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
    throw new Error(`主题元信息读取失败：${err.message}`, { cause: err });
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
  writeThemeFiles(targetDir, theme, css);
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

const THEME_META_KEYS = ['name', 'version', 'author', 'description', 'preview'];

function writeThemeFiles(dirPath, meta, css) {
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, 'theme.json'), JSON.stringify({
    id: meta.id,
    name: meta.name,
    version: meta.version,
    author: meta.author ?? '',
    description: meta.description ?? '',
    preview: isPlainObject(meta.preview) ? meta.preview : {},
  }, null, 2), 'utf-8');
  fs.writeFileSync(path.join(dirPath, 'theme.css'), String(css ?? ''), 'utf-8');
}

// 写卡助手专用主题写入入口。update 命中 builtin 时把整份复制到 user 层再覆写，
// 原 builtin 不动；delete 只清 user 层覆盖。激活态不在此处变更。
export function applyAssistantThemeOp({ id, operation, changes = {} }) {
  assertThemeId(id);
  const targetDir = assertSafeThemePath(DATA_THEMES_DIR, id);

  if (operation === 'create') {
    if (findTheme(id)) throw new Error('主题 id 已存在');
    writeThemeFiles(targetDir, {
      id,
      name: changes.name.trim(),
      version: changes.version.trim(),
      author: changes.author,
      description: changes.description,
      preview: changes.preview,
    }, changes.css);
    return { id, source: 'user' };
  }

  if (operation === 'update') {
    const existing = findTheme(id);
    if (!existing) throw new Error('主题不存在');

    const nextMeta = {
      id,
      name: existing.name,
      version: existing.version,
      author: existing.author,
      description: existing.description,
      preview: existing.preview,
    };
    if ('preview' in changes) {
      nextMeta.preview = isPlainObject(changes.preview) ? changes.preview : {};
    }
    for (const key of ['name', 'version', 'author', 'description']) {
      if (typeof changes[key] === 'string') nextMeta[key] = changes[key];
    }
    if (!nextMeta.name.trim()) throw new Error('theme update 后 name 为空');
    if (!nextMeta.version.trim()) throw new Error('theme update 后 version 为空');

    const nextCss = typeof changes.css === 'string'
      ? changes.css
      : fs.readFileSync(existing.cssPath, 'utf-8');
    if (!nextCss.trim()) throw new Error('theme update 后 css 为空');

    writeThemeFiles(targetDir, nextMeta, nextCss);
    return { id, source: 'user', forkedFromBuiltin: existing.builtin };
  }

  if (operation === 'delete') {
    const existing = findTheme(id);
    if (!existing) throw new Error('主题不存在');
    const userDir = path.join(DATA_THEMES_DIR, id);
    if (!fs.existsSync(userDir)) {
      if (existing.builtin) throw new Error('内置主题不能删除');
      throw new Error('主题不存在');
    }
    fs.rmSync(assertSafeThemePath(DATA_THEMES_DIR, id), { recursive: true, force: true });
    const config = getConfig();
    if (config.ui?.theme === id && !existing.builtin) {
      updateConfig({ ui: { theme: DEFAULT_THEME_ID } });
    }
    return { id, deleted: true };
  }

  throw new Error(`不支持的 operation：${operation}`);
}

export function getThemeSnapshot(id) {
  const theme = findTheme(id);
  if (!theme) throw new Error('主题不存在');
  return {
    id: theme.id,
    name: theme.name,
    version: theme.version,
    author: theme.author,
    description: theme.description,
    preview: theme.preview,
    builtin: theme.builtin,
    source: theme.source,
    css: fs.readFileSync(theme.cssPath, 'utf-8'),
  };
}
