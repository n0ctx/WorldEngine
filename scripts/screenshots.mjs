#!/usr/bin/env node
/**
 * 重拍 docs/images/ 下的页面截图（除 bookshelf.png 外都是本地私密文件，不提交）。
 *
 * 用法（先 `npm run dev` 起好前后端）：
 *   npm run shots                       拍全部
 *   npm run shots -- chat rules         只拍列出的几张，名字见下方 SHOTS
 *   npm run shots -- --theme classic-parchment chat
 *                                       换主题拍，存成 chat-classic-parchment.png；默认夜航，存成 chat.png。
 *                                       主题只在截图浏览器里临时切换，不改用户配置
 *
 * 拍摄口径：1552×936 视口的 2 倍图；开「减少动态效果」，所有动画直接落到终态（封面逐格显现在无头浏览器里播不完）。
 * 截图对象按名字从后端取：世界「现实世界」、角色「寸头男」与他最近的一条对话；写作页进入该世界最近的写作故事线。
 * 依赖全局安装的 agent-browser。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs/images');
const APP = 'http://localhost:5173';
const API = 'http://localhost:3000/api';
const WORLD_NAME = '现实世界';
const CHARACTER_NAME = '寸头男';
const DEFAULT_THEME = 'nocturne';
const VIEWPORT = ['1552', '936', '2'];
const TIMEOUT_MS = 20000;
const SESSION = 'we-shots';

function ab(...args) {
  return execFileSync('agent-browser', args, {
    encoding: 'utf8',
    env: { ...process.env, AGENT_BROWSER_SESSION: SESSION },
  }).trim();
}

const js = (value) => JSON.stringify(value);
const waitFn = (expression) => ab('wait', '--fn', expression, '--timeout', String(TIMEOUT_MS));
const waitText = (text) => ab('wait', '--text', text, '--timeout', String(TIMEOUT_MS));
const run = (script) => ab('eval', script);

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function resolveTargets() {
  const worlds = await getJson(`${API}/worlds`);
  const world = worlds.find((w) => w.name === WORLD_NAME);
  if (!world) throw new Error(`找不到世界「${WORLD_NAME}」`);
  const characters = await getJson(`${API}/worlds/${world.id}/characters`);
  const character = characters.find((c) => c.name === CHARACTER_NAME);
  if (!character) throw new Error(`世界「${WORLD_NAME}」里找不到角色「${CHARACTER_NAME}」`);
  const [session] = await getJson(`${API}/characters/${character.id}/sessions`);
  if (!session) throw new Error(`角色「${CHARACTER_NAME}」还没有对话`);
  return { world, character, session };
}

// 整页打开（会重新加载），临时套上主题；写卡助手的开关会被记住，上一张开过的这里先关上
function openPage(route, theme) {
  ab('open', `${APP}${route}`);
  ab('wait', '--load', 'networkidle');
  run(`import('/src/core/visual/visualThemes.js').then((m) => { m.applyVisualTheme(${js(theme)}); return 'ok'; })`);
  waitFn(`!!document.querySelector('[aria-label="打开写卡助手"], [aria-label="关闭写卡助手"]')`);
  if (run(`!!document.querySelector('[aria-label="关闭写卡助手"]')`) === 'true') {
    clickLabel('关闭写卡助手');
    waitFn(`!!document.querySelector('[aria-label="打开写卡助手"]')`);
  }
}

// 真实点击：先在页面里找到目标并打上标记，再让浏览器点这个标记（有的控件只响应真实的指针事件）
const MARK = 'data-we-shot-target';
function clickFound(findExpression) {
  waitFn(`!!(${findExpression})`);
  run(`(() => {
    document.querySelectorAll('[${MARK}]').forEach((el) => el.removeAttribute('${MARK}'));
    (${findExpression}).setAttribute('${MARK}', '');
    return 'ok';
  })()`);
  ab('click', `[${MARK}]`);
}

// aria-label 等于 label 的元素；within 给出时只在含这段文字（某个末级元素的全部文字）的最近容器里找
function clickLabel(label, within) {
  const selector = `[aria-label=${js(label)}]`;
  if (!within) {
    clickFound(`document.querySelector(${js(selector)})`);
    return;
  }
  clickFound(`(() => {
    let scope = [...document.querySelectorAll('body *')].find((el) => el.children.length === 0 && el.textContent.trim() === ${js(within)});
    while (scope && !scope.querySelector(${js(selector)})) scope = scope.parentElement;
    return scope?.querySelector(${js(selector)});
  })()`);
}

// 按钮的可见文字或 aria-label 等于 name
function clickButton(name) {
  clickFound(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${js(name)} || b.getAttribute('aria-label') === ${js(name)})`);
}

// 两侧抽屉：按钮的 aria-label 是「展开 / 收起」+ 面板名
function setDrawer(name, open) {
  const [from, to] = open ? ['展开', '收起'] : ['收起', '展开'];
  waitFn(`!!document.querySelector('[aria-label="${from}${name}"], [aria-label="${to}${name}"]')`);
  if (run(`!!document.querySelector('[aria-label="${from}${name}"]')`) === 'true') clickLabel(`${from}${name}`);
  waitFn(`!!document.querySelector('[aria-label="${to}${name}"]')`);
}

function waitDialog() {
  waitFn(`!!document.querySelector('[role="dialog"]')`);
}

// 图片都加载完、字体就绪后再停一拍，让布局落定
function settle() {
  waitFn(`document.fonts.status === 'loaded' && [...document.images].every((img) => img.complete)`);
  ab('wait', '800');
}

function openChat({ character, session }, theme, panelsOpen) {
  openPage(`/characters/${character.id}/chat`, theme);
  run(`import('/src/core/state/index.js').then((m) => { m.default.getState().setCurrentSessionId(${js(session.id)}); return 'ok'; })`);
  waitFn(`!!document.querySelector('[data-message-id]')`);
  setDrawer('故事线列表', panelsOpen);
  setDrawer('状态面板', panelsOpen);
}

function openWriting({ world }, theme, panelsOpen) {
  openPage(`/worlds/${world.id}/writing`, theme);
  setDrawer('故事线列表', panelsOpen);
  setDrawer('附近角色与状态', panelsOpen);
}

/** 每张截图一段步骤：把页面摆到要拍的样子，拍照由外层统一做 */
const SHOTS = {
  bookshelf: (t, theme) => openPage('/', theme),
  'world-overview': ({ world }, theme) => {
    openPage(`/worlds/${world.id}`, theme);
    waitText(CHARACTER_NAME);
  },
  assistant: ({ world }, theme) => {
    openPage(`/worlds/${world.id}`, theme);
    clickLabel('打开写卡助手');
    waitFn(`!!document.querySelector('[aria-label="关闭写卡助手"]')`);
  },
  rules: ({ world }, theme) => {
    openPage(`/worlds/${world.id}/rules`, theme);
    waitText('这个世界的规则');
  },
  'world-edit': ({ world }, theme) => {
    openPage('/', theme);
    clickLabel('世界操作', world.name);
    clickButton('编辑世界');
    waitDialog();
  },
  'character-edit': ({ world }, theme) => {
    openPage(`/worlds/${world.id}`, theme);
    clickLabel('编辑角色', CHARACTER_NAME);
    waitDialog();
  },
  'persona-edit': ({ world }, theme) => {
    openPage(`/worlds/${world.id}`, theme);
    clickButton('编辑');
    waitDialog();
  },
  settings: ({ world }, theme) => {
    openPage(`/worlds/${world.id}`, theme);
    clickLabel('打开设置');
    waitText('LLM 配置');
  },
  chat: (t, theme) => openChat(t, theme, false),
  'chat-panels': (t, theme) => openChat(t, theme, true),
  writing: (t, theme) => openWriting(t, theme, false),
  'writing-panels': (t, theme) => openWriting(t, theme, true),
};

function parseArgs(argv) {
  const names = [];
  let theme = DEFAULT_THEME;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--theme') theme = argv[++i];
    else names.push(argv[i]);
  }
  const unknown = names.filter((name) => !SHOTS[name]);
  if (unknown.length) {
    throw new Error(`没有这些截图：${unknown.join('、')}。可选：${Object.keys(SHOTS).join('、')}`);
  }
  return { names: names.length ? names : Object.keys(SHOTS), theme };
}

async function main() {
  const { names, theme } = parseArgs(process.argv.slice(2));
  const targets = await resolveTargets();
  mkdirSync(OUT_DIR, { recursive: true });
  ab('open', 'about:blank');
  ab('set', 'viewport', ...VIEWPORT);
  ab('set', 'media', 'dark', 'reduced-motion');
  try {
    for (const name of names) {
      SHOTS[name](targets, theme);
      settle();
      const file = path.join(OUT_DIR, theme === DEFAULT_THEME ? `${name}.png` : `${name}-${theme}.png`);
      ab('screenshot', file);
      console.log(`✓ ${path.relative(ROOT, file)}`);
    }
  } finally {
    ab('close');
  }
}

main().catch((error) => {
  console.error(`✖ ${error.message}`);
  process.exitCode = 1;
});
