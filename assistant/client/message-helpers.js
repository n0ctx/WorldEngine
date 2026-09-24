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
  theme: '主题', themes: '主题列表',
  config: '全局设置', doc: '参考文档', docs: '参考文档列表',
};

const EDIT_FIELD_NAMES = {
  name: '名称', description: '简介', content: '正文',
  system_prompt: '人设', post_prompt: '后置提示词',
  first_message: '开场白', css: '样式',
};

export function formatToolSummary(summary, toolName) {
  const text = String(summary ?? '').trim();
  if (toolName === 'find') return text;
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

export function formatToolError(error) {
  const text = String(error ?? '').trim();
  const missing = text.match(/^(玩家卡|角色|条目|CSS 片段|正则规则|主题|世界|文档)\s+(?:persona|character|entry|css|regex|theme|world|doc):[^\s；。]+\s+不存在/);
  if (missing) {
    const name = missing[1] === '角色' ? '角色卡' : missing[1];
    if (name === '玩家卡') return '找不到这张玩家卡。请让助手重新查找当前世界的玩家卡后重试。';
    return `找不到${name}。请确认目标是否存在，再让助手重试。`;
  }
  return text;
}
