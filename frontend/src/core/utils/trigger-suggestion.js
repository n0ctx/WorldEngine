// 触发机制智能建议 —— 纯函数，本地启发式规则，不调 LLM。
//
// 理由：这是写条目正文时的即时输入辅助，必须离线、零成本、可预测——
// 调 LLM 会引入网络延迟、不确定性和额外开销，与"边打字边给建议"的场景不匹配。
//
// 关键词抽取方案：只保留高置信信号，宁可少给建议也不给错建议（实测宽松规则下
// 约 40%~50% 的候选是低质量的：截断残词、过泛词、把整句对话当关键词）。
// 只认两类高置信信号：
//   1. 世界内已有的专有名词（角色名、玩家卡名、状态字段 label、这个世界其它条目的
//      标题）在正文里出现——这些词是用户自己在这个世界里定义的，命中就是真命中。
//   2. 书名号《》和直角引号「」包裹、长度合理、不含句末标点、不是整句对话的短词——
//      用户用这类标点本身就是在强调专有名词。
// 两者合并去重，已知专有名词优先排在前面。
// 如果一条正文一个高置信候选都抽不到，就不给关键词建议（机制建议本身仍然可能给出，
// 比如兜底到「一直生效」或「AI 判断相关」，只是不再附带关键词预填）。

const TONE_HINT_WORDS = ['世界观', '总则', '基调', '行为准则', '写作风格', '叙事风格', '语气', '文风', '准则', '风格指南', '写作规则', '总体规则', '基本原则'];

// 句末标点/顿号——包含这些说明括号里的是完整句子或短语列表，而不是一个专有名词。
const SENTENCE_PUNCT_RE = /[。！？，,.!?；;：:～~…、]/;

// 人称代词——真正的专有名词（人名/地名/物名）不会把人称代词当自己的一部分，
// 出现人称代词通常说明这是一句对话（"你爱我吗"）而不是一个名词。
const PRONOUNS = ['你们', '我们', '他们', '她们', '你', '我', '他', '她', '它', '咱', '您'];

// 句末语气助词——出现在候选词末尾，说明这是一句完整的问句/感叹句，不是专有名词。
const SENTENCE_FINAL_PARTICLES = new Set(['吗', '呢', '啊', '吧', '呀', '啦', '嘛', '哦', '哟']);

function isLikelyProperNounQuote(raw) {
  const v = String(raw || '').trim();
  if (v.length < 2 || v.length > 12) return false;
  if (SENTENCE_PUNCT_RE.test(v)) return false;
  if (PRONOUNS.some((p) => v.includes(p))) return false;
  if (SENTENCE_FINAL_PARTICLES.has(v[v.length - 1])) return false;
  return true;
}

const COMPARATOR_MAP = [
  { words: ['不低于', '大于等于', '不小于'], operator: '>=' },
  { words: ['不超过', '不高于', '小于等于'], operator: '<=' },
  { words: ['低于', '小于', '不足'], operator: '<' },
  { words: ['高于', '超过', '大于', '多于'], operator: '>' },
  { words: ['等于'], operator: '=' },
];
// 顺序很重要：先匹配更长/更具体的词组（"不低于"含"低于"），避免被短词提前吃掉。
const ALL_COMPARATOR_WORDS = COMPARATOR_MAP.flatMap((g) => g.words.map((w) => ({ word: w, operator: g.operator })))
  .sort((a, b) => b.word.length - a.word.length);

// 规则二：状态条件——"字段名 + 比较词 + 数字"（不要求紧邻，允许中间隔几个字，
// 例如"当健康低于 20 时"里"健康"和"低于"之间有"当"）。
function matchStateCondition(text, stateFieldLabels) {
  const numRe = /(\d+(?:\.\d+)?)/g;
  let m;
  while ((m = numRe.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    const comparator = ALL_COMPARATOR_WORDS.find((c) => before.includes(c.word));
    if (!comparator) continue;
    const beforeComparator = before.slice(0, before.lastIndexOf(comparator.word));
    const field = stateFieldLabels.find((label) => label && beforeComparator.includes(label));
    if (field) {
      return { field_label: field, operator: comparator.operator, value: m[1] };
    }
  }
  return null;
}

// 规则一：关键词/专有名词抽取——只保留高置信信号，见文件头注释。
function extractKeywordCandidates(text, properNouns) {
  const found = [];
  const seen = new Set();
  const push = (w) => {
    const v = String(w || '').trim();
    if (v.length < 2 || v.length > 12 || seen.has(v)) return;
    seen.add(v);
    found.push(v);
  };

  // 1) 已知专有名词（角色名/玩家名/状态字段名/其它条目标题）优先，命中即真命中
  for (const noun of properNouns) {
    if (noun && text.includes(noun)) push(noun);
  }

  // 2) 书名号《》/直角引号「」包裹的高置信短词
  const cornerRe = /「([^」]{1,12})」/g;
  let cm;
  while ((cm = cornerRe.exec(text))) {
    if (isLikelyProperNounQuote(cm[1])) push(cm[1]);
  }
  const bookRe = /《([^》]{1,12})》/g;
  let bm;
  while ((bm = bookRe.exec(text))) {
    if (isLikelyProperNounQuote(bm[1])) push(bm[1]);
  }

  return found.slice(0, 6);
}

function looksLikeToneContent(text) {
  return TONE_HINT_WORDS.some((w) => text.includes(w));
}

/**
 * 根据条目正文给出触发机制建议。非侵入：只返回建议，调用方决定是否采用。
 *
 * @param {string} content 条目正文
 * @param {object} context
 * @param {string[]} [context.properNouns] 用户在这个世界里起的名字：角色名 / 玩家卡名 /
 *   其它条目的标题。不要传状态字段 label（时间、天气、性格这类日常词会命中任何叙事），
 *   也不要传本条目自己的标题（正文普遍以标题开头，自我命中没有信息量）。
 * @param {string[]} [context.stateFieldLabels] 世界内已有状态字段 label（用于状态条件匹配）
 * @returns {null | { trigger_type: 'state'|'keyword'|'always'|'llm', reason: string, prefill?: object }}
 */
export function suggestTrigger(content, context = {}) {
  const text = String(content || '').trim();
  if (!text) return null;

  const properNouns = Array.isArray(context.properNouns) ? context.properNouns.filter(Boolean) : [];
  const stateFieldLabels = Array.isArray(context.stateFieldLabels) ? context.stateFieldLabels.filter(Boolean) : [];

  // 优先级：状态条件（结构化信号最强）> 专有名词/高置信引号关键词 > 语气基调 > 兜底 AI 判断
  const stateMatch = matchStateCondition(text, stateFieldLabels);
  if (stateMatch) {
    return {
      trigger_type: 'state',
      reason: `检测到正文提到状态字段「${stateMatch.field_label}」的数值条件，建议改用「状态满足条件」`,
      prefill: { conditions: [{ field_label: stateMatch.field_label, operator: stateMatch.operator, value: stateMatch.value }] },
    };
  }

  const keywords = extractKeywordCandidates(text, properNouns);
  if (keywords.length > 0) {
    return {
      trigger_type: 'keyword',
      reason: `检测到正文里的专有名词，建议改用「出现关键词」并预填：${keywords.join(' / ')}`,
      prefill: { keywords },
    };
  }

  if (looksLikeToneContent(text)) {
    return {
      trigger_type: 'always',
      reason: '正文读起来像世界观基调、总则或行为准则，建议改用「一直生效」',
      prefill: {},
    };
  }

  return {
    trigger_type: 'llm',
    reason: '没有检测到明显的关键词或状态条件，建议改用「AI 判断相关」，交给 AI 按情境判断是否注入',
    prefill: {},
  };
}
