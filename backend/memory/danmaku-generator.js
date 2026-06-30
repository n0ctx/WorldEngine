/**
 * danmaku-generator.js — 每轮回复后由副模型生成「观众弹幕」
 *
 * 纯娱乐彩蛋：返回一组短文本字符串，由前端负责颜色/字号/泳道/滚动等表现。
 * 任何失败（无文本 / 解析失败 / 调用异常）一律返回 []，绝不抛出，避免影响主流程。
 */

import * as llm from '../llm/index.js';
import {
  getLastTurnMessages,
  getLatestAssistantMessageId,
  updateMessageDanmaku,
} from '../db/queries/messages.js';
import { buildLastTurnText } from '../services/table-memory.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import { getConfig } from '../services/config.js';
import { stripThinkTags } from './title-generation.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import { LLM_BACKGROUND_TASK_TIMEOUT_MS } from '../utils/constants.js';

const log = createLogger('danmaku');

const DANMAKU_MAX_TOKENS = 800;

function buildPrompt(turnText, count) {
  const system =
    '你是一屏正在刷这段剧情的B站弹幕。发的是真·弹幕，不是影评——既要有网感，也要真的在「看这段剧情」：\n' +
    '- 必须扣住本轮具体内容：点到角色名、具体动作/台词/细节/转折，让人一看就知道在说哪一段，别发放之四海皆可的空话。\n' +
    '- 在此基础上玩起来：口语化、情绪化、不讲语法、碎片化；玩梗、吐槽、接话、磕CP、对角色喊话、阴阳怪气、自我代入都行。\n' +
    '- 适当用语气词和符号（啊啊啊、草、？？？、www、哈哈哈哈）和 emoji（😂🤣😭💦🔥👀🤡），但别整条只有梗和符号、没信息量。\n' +
    '- 每条短（多数10~18字，最多20字），像一闪而过的真弹幕；条条角度不同，别都一个语气、别复读同一个梗。\n' +
    `输出格式：只输出一个 JSON 字符串数组，恰好 ${count} 条，例如 ["周锐这操作我直接绷不住😂","姐姐别喝那杯水啊！！","锁精液推回去是真狠😭"]。` +
    '禁止输出任何解释、标题、代码块标记(```)或数组以外的内容；每条用英文双引号包裹。';
  return [
    { role: 'system', content: system },
    { role: 'user', content: `【最新剧情】\n${turnText}\n\n针对上面这段的具体内容开刷，直接输出 ${count} 条弹幕的 JSON 数组：` },
  ];
}

/**
 * 从模型原始输出里抽取弹幕字符串数组；失败返回 []。
 * 先按 JSON 解析；JSON 不合法（被截断/智能引号/夹带杂质）时退化为正则抽取引号内文本。
 */
function parseDanmaku(raw) {
  const body = stripThinkTags(raw)
    .replace(/```(?:json)?/gi, '')
    .replace(/[“”]/g, '"') // 智能引号归一化，兼容模型输出
    .replace(/[‘’]/g, "'")
    .trim();
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  const clean = (list) =>
    list
      .map((x) => (typeof x === 'string' ? x : String(x ?? '')))
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);

  if (start >= 0 && end > start) {
    try {
      const arr = JSON.parse(body.slice(start, end + 1));
      if (Array.isArray(arr)) return clean(arr);
    } catch {
      // 落到下面的正则兜底
    }
  }
  // 兜底：从（可能被截断的）数组体里抽取所有双引号字符串
  const region = start >= 0 ? body.slice(start) : body;
  const matches = region.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g);
  if (!matches) return [];
  return clean(matches.map((m) => m.slice(1, -1).replace(/\\"/g, '"')));
}

/**
 * 生成弹幕。
 * @param {string} sessionId
 * @param {{ mode?: 'chat'|'writing' }} opts
 * @returns {Promise<string[]>} 弹幕文本数组，失败返回 []
 */
export async function generateDanmaku(sessionId, { mode = 'chat' } = {}) {
  const sid = sessionId.slice(0, 8);
  try {
    const count = Math.max(1, Math.min(20, Number(getConfig().danmaku?.count) || 5));
    // 聊天与写作的消息同存 messages 表，getLastTurnMessages 对两者皆取「最后一条 user + assistant」
    const turnText = buildLastTurnText(getLastTurnMessages(sessionId));
    if (!turnText || !turnText.trim()) return [];

    const raw = await llm.complete(buildPrompt(turnText, count), {
      temperature: 1.0,
      maxTokens: DANMAKU_MAX_TOKENS,
      configScope: resolveAuxScope(sessionId),
      callType: 'danmaku',
      conversationId: sessionId,
      timeoutMs: LLM_BACKGROUND_TASK_TIMEOUT_MS,
    });
    const comments = parseDanmaku(raw).slice(0, count);
    // 持久化到本轮最新 assistant 消息：随消息删除/重生成/会话级联自动回退清理
    if (comments.length > 0) {
      const assistantId = getLatestAssistantMessageId(sessionId);
      if (assistantId) updateMessageDanmaku(assistantId, comments);
    }
    log.info(`DONE  ${formatMeta({ session: sid, mode, count: comments.length })}`);
    return comments;
  } catch (err) {
    log.warn(`FAIL  ${formatMeta({ session: sid, error: err.message })}`);
    return [];
  }
}
