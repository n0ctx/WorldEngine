export function findRegenerateSource(messages, assistantMsgId) {
  if (!Array.isArray(messages) || !assistantMsgId) return null;
  const assistantIdx = messages.findIndex((m) => m.id === assistantMsgId);
  if (assistantIdx <= 0) return null;

  for (let i = assistantIdx - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg) continue;
    if (msg.role === 'assistant') return null;
    if (msg.role === 'user' && msg.content) {
      return { index: i, message: msg };
    }
  }

  return null;
}

const RESOURCE_NAMES = {
  world: '世界', worlds: '世界列表',
  entry: '条目', entries: '条目列表',
  field: '状态字段', fields: '状态字段列表',
  character: '角色卡', characters: '角色卡列表',
  persona: '玩家卡', personas: '玩家卡列表',
  css: '样式片段', regex: '正则规则',
  config: '全局设置', doc: '参考文档', docs: '参考文档列表',
};

const EDIT_FIELD_NAMES = {
  name: '名称', description: '简介', content: '正文',
  system_prompt: '人设', post_prompt: '后置提示词',
  first_message: '开场白', css: '样式',
};

// 批量调用的摘要由「kind×数量」组成，如 "entry×3 field×2" → "条目 ×3、状态字段 ×2"
function formatBatchSummary(text) {
  const parts = [];
  for (const token of text.split(/\s+/)) {
    const [kind, times] = token.split('×');
    const name = RESOURCE_NAMES[kind];
    if (!name) return text;
    parts.push(`${name} ×${times}`);
  }
  return parts.join('、');
}

export function formatToolSummary(summary, toolName) {
  const text = String(summary ?? '').trim();
  if (toolName === 'find') return text;
  if (text.includes('×')) return formatBatchSummary(text);
  const [head, ...rest] = text.split(/\s+/);
  const kind = head?.split(/[:@]/)[0];
  const name = RESOURCE_NAMES[kind];
  if (!name) return text;
  if (toolName === 'edit') {
    const fieldName = EDIT_FIELD_NAMES[rest[0]];
    return fieldName ? `${name}的${fieldName}` : name;
  }
  if (head.includes(':') || head.includes('@')) return name;
  return [name, ...rest].join(' ');
}

// 工具报错是写给模型看的（带 ref、参数名、修正提示），面板上改写成用户看得懂的话，
// 但保留具体是哪处、哪一项、错在哪；原文仍回填给模型。
const PREVIEW_CHARS = 20;
const GENERIC_TOOL_ERROR = '这一步没有成功，助手会调整后重试。';

const fieldName = (key) => EDIT_FIELD_NAMES[key] ?? key;
const preview = (quoted) => {
  let value = quoted;
  try { value = JSON.parse(quoted); } catch { /* 不是 JSON 字符串就按原样截取 */ }
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS)}…` : flat;
};
const atPart = (where) => (where ? where.replace(/：$/, '') : '');
// ref（entry:8531…）换成资源名，已知字段名（content）换成中文
const plainNames = (text) => text
  .replace(/\b([a-z]+):[\w-]+/g, (ref, kind) => RESOURCE_NAMES[kind] ?? ref)
  .replace(/\b[a-z_]+\b/g, (word) => EDIT_FIELD_NAMES[word] ?? RESOURCE_NAMES[word] ?? word);

const TOOL_ERROR_RULES = [
  [/^(第 \d+ 处：)?(\w+) 中找不到 old_text(?:：old_text 的前 \d+ 个字符能对上，之后原文是 ("(?:[^"\\]|\\.)*")，而 old_text 是 ("(?:[^"\\]|\\.)*"))?/,
    (m) => `${atPart(m[1])}要替换的原文在${fieldName(m[2])}里没对上，这处没有改动。`
      + (m[3] ? `原文这里是「${preview(m[3])}」，助手写成了「${preview(m[4])}」。` : '')],
  [/^(第 \d+ 处：)?old_text 在 (\w+) 中出现 (\d+) 次/,
    (m) => `${atPart(m[1])}要替换的原文在${fieldName(m[2])}里出现了 ${m[3]} 次，分不清改哪一处，这处没有改动。`],
  [/^整批未写入（共 (\d+) 项，(\d+) 项有问题）：([\s\S]*)$/,
    (m) => `这一批 ${m[1]} 项里有 ${m[2]} 项不合格，全部没有写入。${formatBatchItems(m[3])}`],
  [/^部分完成（已写入 (\d+) 项，未写入 (\d+) 项）。[\s\S]*?未写入：([\s\S]*?)。先 read/,
    (m) => `已写入 ${m[1]} 项，还有 ${m[2]} 项没写入。${formatBatchItems(m[3], ' — ')}`],
  [/^(玩家卡|角色|条目|CSS 片段|正则规则|世界|文档) \S+ 不存在/,
    (m) => `找不到这个${m[1] === '角色' ? '角色卡' : m[1]}。`],
  [/^输出被截断/, () => '内容太长被截断，这次没有执行。'],
  [/^task cancelled|已取消/, () => '已取消。'],
];

// 批量报错的每一项形如「第 1 项 entry「缺正文」：缺少 content」，项之间用「；」分隔
function formatBatchItems(text, sep = '：') {
  const items = text.split(/；(?=第 \d+ 项 )/).map((line) => {
    const at = line.indexOf(sep);
    const head = plainNames(at < 0 ? line : line.slice(0, at));
    const reason = at < 0 ? '' : line.slice(at + sep.length).trim();
    return reason === '未执行' ? `${head}（未执行）` : `${head}：${formatToolError(reason).replace(/。$/, '')}`;
  });
  return `${items.join('；')}。`;
}

// 认不出的报错：去掉 ref 和给模型的操作指令，剩下的若仍是参数名之类就退回通用说明
function sanitizeToolError(text) {
  const plain = plainNames(text)
    .split(/[；\n]/)[0]
    .replace(/[。.]\s*(先 |请|可用|read\().*$/, '')
    .trim();
  if (!plain || /[A-Za-z_]{2,}|[[\]{}]/.test(plain)) return GENERIC_TOOL_ERROR;
  return /[。！？]$/.test(plain) ? plain : `${plain}。`;
}

export function formatToolError(error) {
  const text = String(error ?? '').trim();
  for (const [pattern, render] of TOOL_ERROR_RULES) {
    const m = text.match(pattern);
    if (m) return render(m);
  }
  return sanitizeToolError(text);
}
