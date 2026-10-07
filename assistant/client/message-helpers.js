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

// 工具报错是写给模型看的（带 ref、参数名、修正提示），面板上只给用户一句大白话；
// 原文仍回填给模型，助手会在最后的回复里说明失败原因。
const TOOL_ERROR_TEXTS = [
  [/中找不到 old_text/, '要替换的原文没对上，这处没有改动。'],
  [/^整批未写入/, '这一批有内容不合格，全部没有写入。'],
  [/^部分完成/, '只写入了一部分。'],
  [/^输出被截断/, '内容太长被截断，这次没有执行。'],
  [/^task cancelled|已取消/, '已取消。'],
  [/^刷新后运行状态已中断/, '刷新后运行状态已中断。'],
];

export function formatToolError(error) {
  const text = String(error ?? '').trim();
  const missing = text.match(/^(玩家卡|角色|条目|CSS 片段|正则规则|世界|文档)\s+(?:persona|character|entry|css|regex|world|doc):[^\s；。]+\s+不存在/);
  if (missing) return `找不到这个${missing[1] === '角色' ? '角色卡' : missing[1]}。`;
  return TOOL_ERROR_TEXTS.find(([pattern]) => pattern.test(text))?.[1] ?? '这一步没有成功，助手会调整后重试。';
}
