/**
 * fake-llm.mjs — 上下文压缩对照评测用的本地假模型（llama.cpp 兼容接口，不连任何真实模型）
 *
 * 按请求内容识别调用类型，用确定性的脚本作答，并记录每次请求的类型与输入 token：
 *   main         主模型续写：按用户消息里的「（第k轮）」回放语料第 k 轮的回复
 *   compress     新版上下文维护员：压缩 CANDIDATES 里的全部原文段、提炼全部候选块（工具调用），工具返回后回「完成」
 *   middle       旧版中期摘要：把进行中记录里已结束的剧情段（同场景的连续轮次）整理成事件
 *   index        轮次索引行：本轮事实句拼成 summary（≤80 字，与模板约定一致）
 *   recall       长期召回：一律不回看（两版相同，评测只比较压缩本身）
 *   title/state/other  返回最小合法内容
 *
 * failKinds 里的调用类型一律返回 500，用来测维护模型持续失败时的兜底。
 * 摘要一律用 scriptedSummary（抽 ※ 事实句、未了承诺优先、按字数上限截断），新旧两版共用同一个摘要器。
 */

import http from 'node:http';

import { scriptedLimit, scriptedSummary } from '../../backend/tests/helpers/story-corpus.js';
import { countContextTokens } from '../../backend/utils/token-counter.js';

const TIER_OF_LABEL = { 一级: 1, 二级: 2, 三级: 3 };
const OLD_EVENT_MAX_CHARS = 200;
const INDEX_MAX_CHARS = 80;
const ROUND_MARK = /（第(\d+)轮）/;

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => part.text ?? '').join('');
  return '';
}

function allText(messages) {
  return messages.map((msg) => textOf(msg.content)).join('\n');
}

function lastUserRound(messages) {
  const lastUser = [...messages].reverse().find((msg) => msg.role === 'user');
  const text = textOf(lastUser?.content);
  const input = text.slice(Math.max(0, text.lastIndexOf('<user_input>')));
  return Number(input.match(ROUND_MARK)?.[1]) || null;
}

/** [调用类型, 判定]，按顺序取第一个命中的 */
const KINDS = [
  ['compress', (body, text) => (body.tools ?? []).some((tool) => tool.function?.name === 'compress') || text.includes('上下文维护员')],
  ['middle', (_body, text) => text.includes('【进行中的记录】')],
  ['index', (_body, text) => text.includes('{"scene":"<地点或场景>"')],
  ['recall', (_body, text) => text.includes('你是记忆召回助手')],
  ['state', (_body, text) => text.includes('你是状态追踪系统')],
  ['title', (_body, text) => text.includes('生成一个标题')],
  ['main', (body) => body.stream === true],
];

function classify(body) {
  const text = allText(body.messages);
  return KINDS.find(([, test]) => test(body, text))?.[0] ?? 'other';
}

function between(text, start, end) {
  const from = text.indexOf(start);
  if (from < 0) return '';
  const to = text.indexOf(end, from + start.length);
  return text.slice(from + start.length, to < 0 ? undefined : to);
}

/** 「【第N轮…】\n正文」段落 → Map<轮号, 正文> */
function sectionRounds(text) {
  const rounds = new Map();
  for (const match of text.matchAll(/【第(\d+)轮[^】]*】\n([\s\S]*?)(?=\n\n【第\d+轮|$)/g)) rounds.set(Number(match[1]), match[2]);
  return rounds;
}

/** 「【bN｜…】\n摘要」段落 → Map<块号, 摘要> */
function blockSummaries(text) {
  const blocks = new Map();
  for (const match of text.matchAll(/【b(\d+)｜[^】]*】\n([\s\S]*?)(?=\n\n【|$)/g)) blocks.set(Number(match[1]), match[2]);
  return blocks;
}

const summarize = (texts, tier) => scriptedSummary(texts, scriptedLimit(texts, tier));

/** 新版：压缩 CANDIDATES 里列出的全部原文段与候选块组 */
function compressRanges(userText, corpus) {
  const rounds = sectionRounds(userText);
  const blocks = blockSummaries(userText);
  const ranges = [];
  for (const match of userText.matchAll(/可压缩原文：第(\d+)(?:–(\d+))?轮/g)) {
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    const texts = [];
    for (let round = start; round <= end; round++) texts.push(rounds.get(round) ?? '');
    ranges.push({ start: String(start), end: String(end), topic: corpus.rounds[start - 1]?.scene ?? '', summary: summarize(texts, 1) });
  }
  for (const match of userText.matchAll(/可提炼：b(\d+) 到 b(\d+)（[^）]*）→ (一级|二级|三级)/g)) {
    const [first, last] = [Number(match[1]), Number(match[2])];
    const texts = [...blocks.entries()].filter(([no]) => no >= first && no <= last).map(([, summary]) => summary);
    ranges.push({ start: `b${first}`, end: `b${last}`, topic: '', summary: summarize(texts, TIER_OF_LABEL[match[3]]) });
  }
  return ranges;
}

/** 旧版：进行中记录里，最后一行所在剧情段之前的完整剧情段各整理成一个事件 */
function middleReply(userText, corpus) {
  const lines = [...between(userText, '【进行中的记录】', '你在维护').matchAll(/第(\d+)轮：(.*)/g)]
    .map((match) => ({ round: Number(match[1]), summary: match[2] }));
  if (lines.length < 2) return '未完';
  const lastArc = corpus.arcOf.get(lines.at(-1).round);
  const events = [];
  for (const line of lines) {
    const arc = corpus.arcOf.get(line.round);
    if (arc === lastArc) break;
    if (events.at(-1)?.arc === arc) events.at(-1).lines.push(line);
    else events.push({ arc, lines: [line] });
  }
  if (events.length === 0) return '未完';
  return events.map((event) => {
    const from = event.lines[0].round;
    const header = `【第${from}–${event.lines.at(-1).round}轮｜不详｜${corpus.rounds[from - 1].scene}｜林遥】`;
    const facts = event.lines.map((line) => line.summary.split('；').map((s) => `※${s}。`).join(''));
    const body = scriptedSummary(facts, OLD_EVENT_MAX_CHARS - header.length - 20).replace(/^事实：/, '');
    return `${header}\n起因：剧情推进。\n经过：见变化。\n结果：告一段落。\n变化：${body}`;
  }).join('\n\n');
}

function indexReply(userText, corpus) {
  const entry = corpus.rounds[Number(userText.match(ROUND_MARK)?.[1]) - 1];
  const facts = (entry?.facts ?? []).map((fact) => fact.text.replace(/^※/, '').replace(/。$/, ''));
  const summary = facts.length > 0 ? facts.join('；') : `林遥在${entry?.scene ?? '某处'}停留`;
  return JSON.stringify({ scene: entry?.scene ?? '', cast: ['林遥'], summary: [...summary].slice(0, INDEX_MAX_CHARS).join('') });
}

function compressReply(body, userText, corpus, record) {
  if (body.messages.some((msg) => msg.role === 'tool')) return { content: '完成' };
  const ranges = compressRanges(userText, corpus);
  record.ranges = ranges.length;
  return { content: '', toolCalls: [{ id: `call_${record.seq}`, type: 'function', function: { name: 'compress', arguments: JSON.stringify({ ranges }) } }] };
}

/** 调用类型 → (body, userText, corpus, record) => { content, toolCalls? } */
const RESPONDERS = {
  main: (body, _text, corpus, record) => {
    record.round = lastUserRound(body.messages);
    record.prompt = allText(body.messages);
    return { content: corpus.rounds[record.round - 1]?.assistant ?? '林遥沉默片刻，夜色渐深。' };
  },
  compress: compressReply,
  middle: (_body, text, corpus) => ({ content: middleReply(text, corpus) }),
  index: (_body, text, corpus) => ({ content: indexReply(text, corpus) }),
  recall: () => ({ content: '{"turns":[]}' }),
  title: () => ({ content: '夜渡' }),
  state: () => ({ content: '{}' }),
  other: () => ({ content: '' }),
};

/** 语料按场景切成剧情段：连续同场景的轮次算一段（旧版「事件」的确定性判定） */
function withArcs(corpus) {
  const arcOf = new Map();
  let arc = 0;
  corpus.rounds.forEach((entry, index) => {
    if (index === 0 || entry.scene !== corpus.rounds[index - 1].scene) arc += 1;
    arcOf.set(entry.round, arc);
  });
  return { ...corpus, arcOf };
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendCompletion(res, body, { content, toolCalls }, promptTokens) {
  const usage = { prompt_tokens: promptTokens, completion_tokens: Math.ceil(content.length / 2), total_tokens: promptTokens };
  if (!body.stream) {
    const message = toolCalls ? { role: 'assistant', content: '', tool_calls: toolCalls } : { role: 'assistant', content };
    sendJson(res, 200, { choices: [{ index: 0, message, finish_reason: toolCalls ? 'tool_calls' : 'stop' }], usage });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content } }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage })}\n\n`);
  res.end('data: [DONE]\n\n');
}

export function startFakeLlm({ corpus, contextLimit, failKinds = [] }) {
  const calls = [];
  const ctx = withArcs(corpus);
  const activity = { inFlight: 0, last: Date.now() };

  function handleCompletion(res, body) {
    const kind = classify(body);
    const record = {
      seq: calls.length,
      kind,
      promptTokens: countContextTokens(body.messages, body.tools ?? []),
      outputAllowance: Number(body.max_completion_tokens ?? body.max_tokens ?? 0),
      round: kind === 'main' ? lastUserRound(body.messages) : null,
    };
    calls.push(record);
    if (failKinds.includes(kind)) {
      record.failed = true;
      sendJson(res, 500, { error: { message: 'scripted failure' } });
      return;
    }
    sendCompletion(res, body, RESPONDERS[kind](body, allText(body.messages), ctx, record), record.promptTokens);
  }

  const server = http.createServer((req, res) => {
    if (req.method === 'GET') {
      if (req.url.endsWith('/props')) sendJson(res, 200, { default_generation_settings: { n_ctx: contextLimit } });
      else sendJson(res, 200, { data: [{ id: 'fake-model' }] });
      return;
    }
    let raw = '';
    activity.inFlight += 1;
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      handleCompletion(res, JSON.parse(raw || '{}'));
      activity.inFlight -= 1;
      activity.last = Date.now();
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      port: server.address().port,
      calls,
      close: () => new Promise((done) => server.close(done)),
      /** 没有进行中的请求、且静默 quietMs 后返回（后台记忆任务都已结束） */
      async idle(quietMs = 60) {
        while (activity.inFlight > 0 || Date.now() - activity.last < quietMs) {
          await new Promise((done) => setTimeout(done, 15));
        }
      },
    }));
  });
}
