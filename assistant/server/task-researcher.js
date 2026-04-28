import { createPreviewCardTool } from './tools/card-preview.js';
import { executeReadFile } from './tools/project-reader.js';
import { createLogger, formatMeta, previewText } from '../../backend/utils/logger.js';

const log = createLogger('as-research', 'blue');

const TARGETS = [
  { target: 'world-card', words: ['世界', 'world', 'lore', '条目', '状态字段', '状态机'] },
  { target: 'character-card', words: ['角色', 'character', '{{char}}', '开场白'] },
  { target: 'persona-card', words: ['玩家', 'persona', '{{user}}', '代入者'] },
  { target: 'global-prompt', words: ['全局', 'global', '模型', '配置'] },
  { target: 'css-snippet', words: ['css', '样式', '主题', '视觉'] },
  { target: 'regex-rule', words: ['正则', '替换', 'regex'] },
];

function includesAny(text, words) {
  return words.some((word) => text.toLowerCase().includes(word.toLowerCase()));
}

function inferOperation(message) {
  if (/删除|移除|清空|销毁|delete/i.test(message)) return 'delete';
  if (/修改|更新|调整|修复|补充|追加|覆盖|改/i.test(message)) return 'update';
  return 'create';
}

function inferTargets(message, context = {}) {
  const found = TARGETS.filter((item) => includesAny(message, item.words)).map((item) => item.target);
  if (context.characterId || context.character?.id) found.push('character-card');
  if (context.worldId || context.world?.id) found.push('world-card');
  return [...new Set(found.length ? found : ['world-card'])];
}

function safeJsonParse(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function summarizePreview(target, data) {
  if (!data || typeof data !== 'object') return `${target}：未读取到结构化数据`;
  if (target === 'world-card') {
    return `世界卡：${data.name || '未命名'}；条目 ${data.existingEntries?.length ?? 0}；状态字段 世界 ${data.existingWorldStateFields?.length ?? 0} / 玩家 ${data.existingPersonaStateFields?.length ?? 0} / 角色 ${data.existingCharacterStateFields?.length ?? 0}`;
  }
  if (target === 'character-card') {
    return `角色卡：${data.name || '未命名'}；角色状态字段 ${data.existingCharacterStateFields?.length ?? 0}；状态值 ${data.existingCharacterStateValues?.length ?? 0}`;
  }
  if (target === 'persona-card') {
    return `玩家卡：${data.name || '未命名'}；玩家状态字段 ${data.existingPersonaStateFields?.length ?? 0}；状态值 ${data.existingPersonaStateValues?.length ?? 0}`;
  }
  if (target === 'global-prompt') return `全局配置：provider=${data.llm?.provider || '未知'}，model=${data.llm?.model || '未知'}`;
  if (target === 'css-snippet') return `CSS 片段：${data.existingSnippets?.length ?? 0} 条`;
  if (target === 'regex-rule') return `正则规则：${data.existingRules?.length ?? 0} 条`;
  return `${target}：已读取`;
}

function buildConstraints(operation, targets) {
  const constraints = [
    '写入前必须生成 proposal，并通过 normalizeProposal 归一化。',
    '世界卡正文通过 entryOps 管理，world-card changes 不写 system_prompt/post_prompt。',
  ];
  if (operation !== 'create') constraints.push('已有实体 update/delete 必须基于 preview_card 读取到的现状制定计划。');
  if (targets.includes('character-card')) constraints.push('character-card create 需要 worldId，可来自 context.worldId 或前序 world-card create 产物。');
  if (targets.includes('persona-card')) constraints.push('persona-card create/update 的 entityId 语义为 worldId。');
  return constraints;
}

export async function researchTask({ message, context = {} }) {
  const operation = inferOperation(message);
  const targets = inferTargets(message, context);
  const previewCardTool = createPreviewCardTool(context);
  const findings = [];
  const gaps = [];
  const previews = {};

  log.info(`RESEARCH START  ${formatMeta({ operation, targets: targets.join(','), message: previewText(message, { limit: 120 }) })}`);

  for (const target of targets) {
    if (operation === 'create' && (target === 'world-card' || target === 'css-snippet' || target === 'regex-rule')) continue;
    const raw = await previewCardTool.execute({ target, operation });
    if (typeof raw === 'string' && raw.startsWith('错误：')) {
      gaps.push(`${target} 读取失败：${raw.slice(3)}`);
      continue;
    }
    const data = safeJsonParse(raw);
    previews[target] = data ?? raw;
    findings.push(summarizePreview(target, data));
  }

  if (/契约|schema|字段|接口|文档/i.test(message)) {
    const contract = executeReadFile({ path: 'assistant/CONTRACT.md' });
    findings.push(`契约文档可用：assistant/CONTRACT.md（${String(contract).length} 字符，planner 可按需引用）`);
  }

  const needsPlanApproval = operation !== 'create' || targets.length > 1 || /复杂|完整|从零|状态机|多角色|高风险|删除|覆盖|重置|清空/.test(message);
  const research = {
    summary: findings.length > 0 ? findings.join('；') : '未发现必须读取的既有实体，按创建类任务处理。',
    operation,
    targets,
    findings,
    constraints: buildConstraints(operation, targets),
    gaps,
    previews,
    needsPlanApproval,
  };

  log.info(`RESEARCH READY  ${formatMeta({ operation, targets: targets.length, findings: findings.length, gaps: gaps.length, needsPlanApproval })}`);
  return research;
}

export const __testables = {
  inferOperation,
  inferTargets,
  summarizePreview,
};
